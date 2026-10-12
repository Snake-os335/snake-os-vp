/*
 * Snake OS · MAX7219 8×8 — cola web (~m Matriz LED/Snake + ~c1/~c?/~g llamadas/¿Dónde?)
 * Bit-bang SPI — no LedControl library.
 *
 * Elegoo MAX7219 module (same as snake-os-joystick.ino): DIN=12, CLK=10, CS=11.
 * Optional orientation (FC-16 modules): uncomment as needed.
 * #define ROTATE_90
 * #define MIRROR_X
 * #define MIRROR_Y
 */

#ifndef PIN_DIN
#define PIN_DIN 12
#endif
#ifndef PIN_CLK
#define PIN_CLK 10
#endif
#ifndef PIN_CS
#define PIN_CS 11
#endif

#include <Arduino.h>
#include <math.h>
#include <string.h>
#include <stdlib.h>

static const uint8_t MAX_FRAMES = 32;
static const uint16_t LINE_MAX = 220;
static bool lineOverflow = false;

// --- MAX7219 registers (digit/row 1–8) ---
static const uint8_t REG_DECODE = 0x09;
static const uint8_t REG_INTENSITY = 0x0A;
static const uint8_t REG_SCAN = 0x0B;
static const uint8_t REG_SHUTDOWN = 0x0C;
static const uint8_t REG_TEST = 0x0F;

static uint8_t brightness = 8;

static uint8_t animFrames[MAX_FRAMES][8];
static uint8_t animDur[MAX_FRAMES]; // ms / 10
static uint8_t animCount = 0;
static bool animLoop = false;
static bool animRunning = false;
static uint8_t animIdx = 0;
static uint32_t animNextMs = 0;

static char uploadJob[48];
static bool uploadActive = false;
static uint8_t uploadTotal = 0;
static uint8_t uploadNextIdx = 0;
static bool uploadLoop = false;

static char lineBuf[LINE_MAX];
static uint16_t lineLen = 0;

static bool callActive = false;
static uint32_t callStartMs = 0;

static const uint8_t CALL_FRAME_A[8] = {0x3C, 0x42, 0x99, 0xA5, 0xA5, 0x99, 0x42, 0x3C};
static const uint8_t CALL_FRAME_B[8] = {0x3C, 0x7E, 0xFF, 0xFF, 0xFF, 0xFF, 0x7E, 0x3C};

static void replyErr(const char *kind) {
  Serial.print(F("~m err "));
  Serial.println(kind);
}

static int hexVal(char c) {
  if (c >= '0' && c <= '9') return c - '0';
  if (c >= 'a' && c <= 'f') return c - 'a' + 10;
  if (c >= 'A' && c <= 'F') return c - 'A' + 10;
  return -1;
}

static bool parseHexByte(const char *s, uint8_t *out) {
  int hi = hexVal(s[0]);
  int lo = hexVal(s[1]);
  if (hi < 0 || lo < 0) return false;
  *out = (uint8_t)((hi << 4) | lo);
  return true;
}

static bool parseHex16(const char *s, uint8_t *buf8) {
  for (uint8_t i = 0; i < 8; i++) {
    if (!parseHexByte(s + i * 2, &buf8[i])) return false;
  }
  return true;
}

static void spiBitBang(uint8_t data) {
  for (int8_t bit = 7; bit >= 0; bit--) {
    digitalWrite(PIN_CLK, LOW);
    digitalWrite(PIN_DIN, (data >> bit) & 1);
    digitalWrite(PIN_CLK, HIGH);
  }
}

static void max7219Write(uint8_t reg, uint8_t data) {
  digitalWrite(PIN_CS, LOW);
  spiBitBang(reg);
  spiBitBang(data);
  digitalWrite(PIN_CS, HIGH);
}

// Re-send before every draw: after a brownout/glitch the MAX7219 falls back to
// scan limit 0 (only row 1 lit) and never gets setup() again.
static void max7219Config() {
  max7219Write(REG_TEST, 0x00);
  max7219Write(REG_SHUTDOWN, 0x01);
  max7219Write(REG_DECODE, 0x00);
  max7219Write(REG_SCAN, 0x07);
  max7219Write(REG_INTENSITY, brightness);
}

static void max7219Init() {
  pinMode(PIN_DIN, OUTPUT);
  pinMode(PIN_CLK, OUTPUT);
  pinMode(PIN_CS, OUTPUT);
  digitalWrite(PIN_CS, HIGH);
  digitalWrite(PIN_CLK, LOW);
  digitalWrite(PIN_DIN, LOW);
  delay(20);

  // Display-test ON lights every LED; clear it first, then blank digits.
  max7219Config();
  for (uint8_t row = 1; row <= 8; row++) {
    max7219Write(row, 0x00);
  }
}

static void max7219SetBrightness(uint8_t b) {
  if (b > 15) b = 15;
  brightness = b;
  max7219Write(REG_INTENSITY, brightness);
}

static void max7219Clear() {
  max7219Config();
  for (uint8_t row = 1; row <= 8; row++) {
    max7219Write(row, 0x00);
  }
}

static void transformAndShow(const uint8_t frame[8]) {
  uint8_t hw[8];
  for (uint8_t i = 0; i < 8; i++) hw[i] = 0;

  for (uint8_t sr = 0; sr < 8; sr++) {
    for (uint8_t sc = 0; sc < 8; sc++) {
      if (!(frame[sr] & (1u << sc))) continue;
      uint8_t hr = sr;
      uint8_t hc = sc;
#ifdef MIRROR_X
      hc = (uint8_t)(7 - hc);
#endif
#ifdef MIRROR_Y
      hr = (uint8_t)(7 - hr);
#endif
#ifdef ROTATE_90
      {
        uint8_t tr = hr;
        hr = hc;
        hc = (uint8_t)(7 - tr);
      }
#endif
      hw[hr] |= (1u << hc);
    }
  }

  max7219Config();
  for (uint8_t row = 1; row <= 8; row++) {
    max7219Write(row, hw[row - 1]);
  }
}

static void stopAnimation() {
  animRunning = false;
  animIdx = 0;
  animCount = 0;
}

static void abortUpload() {
  uploadActive = false;
  uploadJob[0] = '\0';
  uploadTotal = 0;
  uploadNextIdx = 0;
  uploadLoop = false;
}

static void cmdClear() {
  stopAnimation();
  abortUpload();
  max7219Clear();
  Serial.println(F("~m ok c"));
}

static void cmdBrightness(const char *args) {
  while (*args == ' ') args++;
  if (*args == '\0') {
    replyErr("range");
    return;
  }
  long v = 0;
  while (*args >= '0' && *args <= '9') {
    v = v * 10 + (*args - '0');
    args++;
  }
  if (*args != '\0' && *args != ' ') {
    replyErr("range");
    return;
  }
  if (v < 0 || v > 15) {
    replyErr("range");
    return;
  }
  max7219SetBrightness((uint8_t)v);
  Serial.println(F("~m ok b"));
}

static void cmdFrame(const char *hex) {
  while (*hex == ' ') hex++;
  if (strlen(hex) != 16) {
    replyErr("len");
    return;
  }
  uint8_t frame[8];
  if (!parseHex16(hex, frame)) {
    replyErr("hex");
    return;
  }
  stopAnimation();
  abortUpload();
  transformAndShow(frame);
  Serial.println(F("~m ok f"));
}

static bool storeAnimFrame(uint8_t idx, const char *tok18) {
  if (idx >= MAX_FRAMES) return false;
  if (strlen(tok18) != 18) return false;
  char hex16[17];
  memcpy(hex16, tok18, 16);
  hex16[16] = '\0';
  if (!parseHex16(hex16, animFrames[idx])) return false;
  int d = hexVal(tok18[16]);
  int d2 = hexVal(tok18[17]);
  if (d < 0 || d2 < 0) return false;
  animDur[idx] = (uint8_t)((d << 4) | d2);
  return true;
}

static void cmdAnim(const char *args) {
  char job[48];
  uint8_t idx0 = 0;
  uint8_t total = 0;
  uint8_t loop = 0;

  while (*args == ' ') args++;
  const char *p = args;
  size_t ji = 0;
  while (*p && *p != ' ' && ji + 1 < sizeof(job)) {
    job[ji++] = *p++;
  }
  job[ji] = '\0';
  if (ji == 0) {
    replyErr("len");
    return;
  }
  while (*p == ' ') p++;

  char *end = nullptr;
  long v0 = strtol(p, &end, 10);
  if (end == p) {
    replyErr("range");
    return;
  }
  p = end;
  while (*p == ' ') p++;
  long vTotal = strtol(p, &end, 10);
  if (end == p) {
    replyErr("range");
    return;
  }
  p = end;
  while (*p == ' ') p++;
  long vLoop = strtol(p, &end, 10);
  if (end == p || (vLoop != 0 && vLoop != 1)) {
    replyErr("range");
    return;
  }
  p = end;
  while (*p == ' ') p++;

  if (v0 < 0 || v0 >= MAX_FRAMES || vTotal < 1 || vTotal > MAX_FRAMES) {
    replyErr("range");
    return;
  }
  idx0 = (uint8_t)v0;
  total = (uint8_t)vTotal;
  loop = (uint8_t)vLoop;

  if (!uploadActive) {
    strncpy(uploadJob, job, sizeof(uploadJob) - 1);
    uploadJob[sizeof(uploadJob) - 1] = '\0';
    uploadTotal = total;
    uploadNextIdx = 0;
    uploadLoop = loop != 0;
    uploadActive = true;
    animCount = 0;
  } else if (strcmp(uploadJob, job) != 0 || uploadTotal != total) {
    replyErr("seq");
    return;
  }

  if (idx0 != uploadNextIdx) {
    replyErr("seq");
    return;
  }

  stopAnimation();

  uint8_t tokCount = 0;
  uint8_t curIdx = idx0;

  while (*p) {
    while (*p == ' ' || *p == ',') p++;
    if (*p == '\0') break;

    const char *tokStart = p;
    uint8_t tokLen = 0;
    while (p[tokLen] && p[tokLen] != ',' && p[tokLen] != ' ') tokLen++;
    if (tokLen != 18) {
      replyErr("len");
      return;
    }
    char tok[19];
    memcpy(tok, tokStart, 18);
    tok[18] = '\0';

    if (curIdx >= uploadTotal) {
      replyErr("range");
      return;
    }
    if (!storeAnimFrame(curIdx, tok)) {
      replyErr("hex");
      return;
    }
    curIdx++;
    tokCount++;
    p = tokStart + tokLen;
  }

  if (tokCount == 0) {
    replyErr("len");
    return;
  }

  uploadNextIdx = curIdx;
  if (uploadNextIdx > uploadTotal) {
    replyErr("range");
    return;
  }

  animCount = uploadNextIdx;
  animLoop = uploadLoop;

  Serial.print(F("~m ok A "));
  Serial.print(uploadJob);
  Serial.print(' ');
  Serial.println(tokCount);

  if (uploadNextIdx >= uploadTotal) {
    uploadActive = false;
    animIdx = 0;
    animRunning = true;
    transformAndShow(animFrames[0]);
    animNextMs = millis() + (uint32_t)animDur[0] * 10u;
    if (animCount == 1 && !animLoop) {
      animRunning = false;
    }
  }
}

static void startCallAnimation() {
  stopAnimation();
  abortUpload();
  memcpy(animFrames[0], CALL_FRAME_A, 8);
  memcpy(animFrames[1], CALL_FRAME_B, 8);
  animDur[0] = 12;
  animDur[1] = 12;
  animCount = 2;
  animLoop = true;
  animIdx = 0;
  animRunning = true;
  transformAndShow(animFrames[0]);
  animNextMs = millis() + 120;
}

static void cmdCallStart() {
  callActive = true;
  callStartMs = millis();
  startCallAnimation();
}

static void cmdCallEnd() {
  uint32_t elapsed = callActive ? (millis() - callStartMs) : 0;
  callActive = false;
  stopAnimation();
  abortUpload();
  max7219Clear();
  uint32_t sec = elapsed / 1000UL;
  uint32_t min = sec / 60UL;
  sec %= 60UL;
  Serial.print(F("~d "));
  Serial.print(min);
  Serial.print(' ');
  Serial.println(sec);
}

static long parseLongField(const char **p) {
  while (**p == ' ') (*p)++;
  char *end = nullptr;
  long v = strtol(*p, &end, 10);
  if (end == *p) return 0x7FFFFFFF;
  *p = end;
  return v;
}

static double toRad(double deg) { return deg * 0.017453292519943295; }

static long haversineMeters(long la1e6, long lo1e6, long la2e6, long lo2e6) {
  double lat1 = la1e6 / 1000000.0;
  double lon1 = lo1e6 / 1000000.0;
  double lat2 = la2e6 / 1000000.0;
  double lon2 = lo2e6 / 1000000.0;
  const double R = 6371000.0;
  double dLat = toRad(lat2 - lat1);
  double dLon = toRad(lon2 - lon1);
  double a = sin(dLat / 2) * sin(dLat / 2) +
             cos(toRad(lat1)) * cos(toRad(lat2)) * sin(dLon / 2) * sin(dLon / 2);
  double c = 2 * atan2(sqrt(a), sqrt(1 - a));
  return (long)(R * c + 0.5);
}

static void showDistanceBar(long meters) {
  stopAnimation();
  abortUpload();
  uint8_t n = 8;
  if (meters < 0) meters = 0;
  if (meters < 500) n = 2;
  else if (meters < 2000) n = 3;
  else if (meters < 10000) n = 5;
  else if (meters < 50000) n = 7;
  uint8_t frame[8];
  memset(frame, 0, sizeof(frame));
  for (uint8_t row = 8 - n; row < 8; row++) {
    frame[row] = 0xFF;
  }
  transformAndShow(frame);
}

static void cmdWhere(const char *args) {
  const char *p = args;
  long la1 = parseLongField(&p);
  long lo1 = parseLongField(&p);
  long la2 = parseLongField(&p);
  long lo2 = parseLongField(&p);
  if (la1 == 0x7FFFFFFF || lo1 == 0x7FFFFFFF || la2 == 0x7FFFFFFF || lo2 == 0x7FFFFFFF) {
    return;
  }
  long meters = haversineMeters(la1, lo1, la2, lo2);
  Serial.print(F("~h "));
  Serial.println(meters);
  showDistanceBar(meters);
}

static void handleMatrixLine(char *line) {
  while (*line == ' ' || *line == '\t') line++;
  if (strncmp(line, "~m", 2) != 0) return;
  line += 2;
  if (*line != ' ' && *line != '\0') return;
  if (*line == ' ') line++;

  if (*line == '?') {
    if (line[1] != '\0' && line[1] != ' ') {
      replyErr("len");
      return;
    }
    Serial.println(F("~m hi 1 8x8"));
    return;
  }

  if (*line == 'c') {
    if (line[1] != '\0' && line[1] != ' ') {
      replyErr("len");
      return;
    }
    cmdClear();
    return;
  }

  if (*line == 'b') {
    cmdBrightness(line + 1);
    return;
  }

  if (*line == 'f') {
    cmdFrame(line + 1);
    return;
  }

  if (*line == 'A') {
    cmdAnim(line + 1);
    return;
  }

  replyErr("len");
}

static void dispatchLine(char *line) {
  while (*line == ' ' || *line == '\t') line++;
  if (strncmp(line, "~m", 2) == 0) {
    handleMatrixLine(line);
    return;
  }
  if (strcmp(line, "~c1") == 0) {
    cmdCallStart();
    return;
  }
  if (strcmp(line, "~c?") == 0) {
    cmdCallEnd();
    return;
  }
  if (strncmp(line, "~g ", 3) == 0) {
    cmdWhere(line + 3);
    return;
  }
}

static void pollSerial() {
  while (Serial.available() > 0) {
    char c = (char)Serial.read();
    if (c == '\r') continue;
    if (c == '\n') {
      if (lineOverflow) {
        // Discard oversized line; one error only (avoid Serial flood).
        replyErr("len");
        lineOverflow = false;
        lineLen = 0;
        continue;
      }
      if (lineLen > 0) {
        lineBuf[lineLen] = '\0';
        dispatchLine(lineBuf);
        lineLen = 0;
      }
      continue;
    }
    if (lineOverflow) {
      continue; // sync to newline
    }
    if (lineLen >= LINE_MAX - 1) {
      lineOverflow = true;
      lineLen = 0;
      continue;
    }
    lineBuf[lineLen++] = c;
  }
}

static void tickAnimation() {
  if (!animRunning || animCount == 0) return;
  uint32_t now = millis();
  if (now < animNextMs) return;

  animIdx++;
  if (animIdx >= animCount) {
    if (!animLoop) {
      animRunning = false;
      return;
    }
    animIdx = 0;
  }
  transformAndShow(animFrames[animIdx]);
  animNextMs = now + (uint32_t)animDur[animIdx] * 10u;
}

void setup() {
  Serial.begin(115200);
  // Mega USB-serial: give host a moment after optional bootloader, then announce.
  delay(50);
  max7219Init();
  Serial.println(F("~m hi 1 8x8"));
}

void loop() {
  pollSerial();
  tickAnimation();
}
