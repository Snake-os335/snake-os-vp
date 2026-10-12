/* Doganiero TV — narración es-ES y una escena distinta por parte.
   La línea de tiempo es la suma de minMs (la voz acaba dentro de cada parte):
   faro 5:30, tren 6:30, fuente 7:30, bosque 8:30, ciudad 9:30, barco 6:00.
   No se llama a cancel() en el mismo turno que speak(). */
(function () {
  var THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js';
  var threePromise = null;
  function loadThree() {
    if (window.THREE) return Promise.resolve(window.THREE);
    if (threePromise) return threePromise;
    threePromise = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = THREE_URL;
      s.async = true;
      s.onload = function () { if (window.THREE) resolve(window.THREE); else reject(new Error('THREE')); };
      s.onerror = function () { reject(new Error('THREE')); };
      document.head.appendChild(s);
    });
    return threePromise;
  }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function pickSpanishVoice() {
    var list = [];
    try { list = window.speechSynthesis.getVoices() || []; } catch (e) { return null; }
    var localEs = null, anyEsES = null, anyEs = null;
    for (var i = 0; i < list.length; i++) {
      var v = list[i];
      var lang = String(v.lang || '').toLowerCase().replace('_', '-');
      if (lang.indexOf('es') !== 0) continue;
      var local = v.localService !== false;
      if (lang === 'es-es' && local) return v;
      if (local && !localEs) localEs = v;
      if (lang === 'es-es' && !anyEsES) anyEsES = v;
      if (!anyEs) anyEs = v;
    }
    return localEs || anyEsES || anyEs;
  }
  function splitChunks(text) {
    var src = String(text || '').replace(/\s+/g, ' ').trim();
    var out = [], buf = '';
    for (var i = 0; i < src.length; i++) {
      var ch = src.charAt(i);
      buf += ch;
      var end = (ch === '.' || ch === '!' || ch === '?' || ch === ';');
      if ((end && buf.length > 40) || (buf.length >= 160 && ch === ' ')) { out.push(buf.trim()); buf = ''; }
    }
    if (buf.trim()) out.push(buf.trim());
    return out.length ? out : [src];
  }
  var EPISODES = [
    { id:'faro', title:'El faro y la niebla', parts:[
      { scene:'faro-muelle', minMs:50000, text:'En el puerto de Doganiero el día se iba despacio. Las tablas del muelle olían a sal y a cuerda mojada. Dos barcas pequeñas dormían atadas, y el agua las mecía como si les contara un secreto. Un farero joven, de nombre Nilo, guardó el pan en el bolsillo y miró hacia el acantilado. Arriba, el faro todavía no había encendido su ojo. Nilo sabía que la niebla llegaría antes de la noche, porque las gaviotas volaban bajo y el horizonte se borraba. Caminó entre los postes, saludó a una red tendida y prometió en voz baja que nadie se perdería esa noche.' },
      { scene:'faro-acantilado', minMs:52000, text:'El sendero subía entre rocas grises. Cada paso sonaba seco, y el viento empujaba a Nilo hacia el muro del acantilado. Abajo, el puerto se volvía pequeño. La niebla empezaba como un pañuelo fino y luego como una sábana. Nilo se detuvo a recoger una piedra lisa para no olvidar el camino de vuelta. Recordó a su abuela, que decía que la niebla no es enemiga: solo pide una luz paciente. Siguió subiendo, con la mano en la pared fría, hasta que el faro apareció negro contra el cielo pálido.' },
      { scene:'faro-oscuro', minMs:55000, text:'La puerta del faro chirrió. Dentro olía a aceite y a madera vieja. La escalera de caracol daba vueltas y más vueltas. Nilo subió contando los escalones para no pensar en la oscuridad. En la sala de la lámpara todo estaba quieto. El cristal estaba limpio, pero la llama no había nacido. Por la ventana el mar ya no se veía: solo un blanco espeso. Nilo apoyó la frente en el vidrio y escuchó. Encendería la luz antes de que el silencio se volviera peligro.' },
      { scene:'faro-niebla', minMs:58000, text:'Nilo acercó la cerilla. La llama dudó, se agachó y al fin se quedó. Una luz pequeña llenó la sala y luego empujó la niebla un palmo, nada más. Fuera, el mundo seguía blanco. El farero giró la lámpara con la mano, despacio, para probar el mecanismo. La niebla se tragaba el resplandor. Nilo no se rindió. Añadió aceite, limpió una mota y volvió a girar. Cada vuelta era una frase que decía: aquí estoy, aquí está la costa.' },
      { scene:'faro-haz', minMs:60000, text:'Por fin el haz se soltó. Una cinta dorada cortó la niebla y dibujó un camino sobre el agua. Giraba con calma, como un brazo que busca a alguien. Nilo sonrió sin hacer ruido. Abajo, una ola levantó espuma y la luz la volvió de plata. El faro ya no era una torre oscura: era una voz. En algún lugar, un timón se enderezó. Nilo siguió vigilando el giro, contando las vueltas, seguro de que la niebla había encontrado quien le contestara.' },
      { scene:'faro-regreso', minMs:55000, text:'Una lucecita respondió desde el blanco. Luego otra. Un barco pequeño salió de la niebla con las ventanas encendidas. Pasó frente al faro y hizo sonar una campana corta, de gracias. Nilo levantó la mano, aunque nadie pudiera verle la cara. El barco buscó el puerto y las barcas dormidas lo recibieron. La niebla no se fue del todo, pero ya no daba miedo. El faro siguió girando, paciente, y la costa, otra vez, tuvo camino.' }
    ]},
    { id:'tren', title:'El tren de medianoche', parts:[
      { scene:'tren-anden', minMs:52000, text:'La estación de medianoche no tenía prisa. El reloj avanzaba con pasos suaves y el andén olía a madera húmeda. Lila, que cuidaba las lámparas, pasó un trapo por el banco vacío. No esperaba a mucha gente. El tren de esa hora no llevaba viajeros con maletas: llevaba luces. Aun así, Lila dejaba una taza de leche caliente en el alféizar, por si el maquinista quería saludar. Fuera, el valle dormía. Dentro, la estación mantenía los ojos abiertos.' },
      { scene:'tren-farol', minMs:54000, text:'Lila salió al borde del andén con un farol en la mano. El viento lo hacía oscilar y la llama dibujaba círculos cortos. Ella lo levantó tres veces, que era la señal antigua: el camino está libre. Nadie contestó todavía. Las vías brillaban apenas, como dos hilos perdidos en la hierba. Lila escuchó. Primero oyó grillos. Después, muy lejos, un rumor ordenado, de hierro que respira. No apagó el farol. El tren había salido puntual, como siempre que la luna estaba alta.' },
      { scene:'tren-llega', minMs:56000, text:'Una estrella baja apareció entre los árboles. No era estrella: era el faro del tren. Creció, tembló y se volvió un ojo blanco. El andén vibró con educación, sin asustar a nadie. Lila dio un paso atrás y sostuvo el farol quieto. El tren traía una locomotora del color de la noche. No pitó fuerte. Solo soltó un suspiro de vapor que se deshizo enseguida. Las ruedas contaban los durmientes uno a uno, como quien no quiere despertar al valle.' },
      { scene:'tren-vagones', minMs:58000, text:'Al pasar, los vagones mostraron sus ventanas. En cada una había una luz cálida. En la primera viajaba una maleta sola, bien sentada. En la segunda, un ramo de lavanda atado con hilo. En la tercera, un cuaderno abierto que nadie leía, porque el tren también sabía guardar silencios. Lila los miró como se miran las barcas cuando vuelven. El tren no se detuvo del todo, pero bajó la marcha, agradecido, y la leche dejó un vaho breve en el aire frío.' },
      { scene:'tren-tunel', minMs:60000, text:'Más allá de la estación el valle se cerraba en un túnel antiguo. El tren entró sin miedo. Dentro, el mundo se volvió negro y solo quedaron las ventanas, como fichas de un juego lento. Lila no podía verlo, pero le gustaba imaginar ese tramo: el techo de piedra, las gotas, el eco corto de las ruedas. El maquinista conocía cada curva de memoria. No aceleró. La medianoche no es hora de correr. Cuando el último vagón desapareció, la boca del túnel quedó otra vez oscura.' },
      { scene:'tren-puente', minMs:56000, text:'Al otro lado, el tren cruzó el puente del río. Los pilares estaban cubiertos de musgo y el agua copiaba la luna en pedazos. Las ventanas se reflejaron como barcas cuadradas. Un pez saltó y rompió el dibujo, y el río lo volvió a armar sin quejarse. El tren iba en fila, fiel a las vías, y el puente crujió una sola vez, como quien dice adelante. Lila, ya lejos, apagó una lámpara de más. Sabía que esa parte del viaje era la más bonita.' },
      { scene:'tren-pueblo', minMs:54000, text:'El pueblo del final tenía tres casas despiertas y un tejado con una bandera pequeña. El tren frenó junto a un banco de madera y soltó el vapor que le quedaba. El maquinista dejó el ramo de lavanda en el banco, porque era el encargo de la noche. Una ventana se encendió. Alguien dijo gracias en voz baja. El tren descansó un minuto entero, que en medianoche es mucho, y luego se preparó para volver. Lila, en su estación, ya había puesto el reloj en hora.' }
    ]},
    { id:'fuente', title:'La fuente que cuenta monedas al revés', parts:[
      { scene:'fuente-dia', minMs:60000, text:'La plaza de Doganiero tenía una fuente redonda y bancos cálidos de sol. Por la mañana el agua estaba quieta, casi dormida, y las palomas caminaban por el borde. Vera llegó con una moneda en el puño. Quería saber si los deseos se gastan. Su abuelo le había dicho que esa fuente no cobraba como las demás. Vera se sentó, dejó la moneda sobre la rodilla y miró el chorro fino del centro. Todavía no pasaba nada. La plaza solo olía a pan y a piedra mojada.' },
      { scene:'fuente-ninos', minMs:62000, text:'Poco a poco llegaron otros niños. Uno traía una canica, otra un botón dorado, y el pequeño Mateo una moneda de un bolsillo roto. No empujaban. Formaron un corro y contaron lo que sabían. Decían que la fuente devolvía lo que le dabas, pero hacia arriba, para que el cielo lo viera primero. Vera no se rio. Si un deseo es bueno, no hace falta esconderlo en el fondo del agua. Esperaron a que la sombra del campanario tocara el borde de piedra. Esa era la hora.' },
      { scene:'fuente-una', minMs:64000, text:'Vera tiró su moneda con cuidado, casi sin fuerza. La pieza tocó el agua y, en vez de hundirse, se detuvo. Luego subió. Despacio, como una burbuja educada, brillando cada vez que giraba. Los niños abrieron la boca y nadie gritó, por si el hechizo era tímido. La moneda pasó junto al chorro y siguió subiendo hasta la altura de los ojos. Vera sintió que su pregunta también subía. La fuente pareció estar de acuerdo.' },
      { scene:'fuente-lluvia', minMs:68000, text:'Mateo se animó y lanzó la suya. Después el botón, después la canica, que no era moneda pero la fuente no puso reparos. Todas subieron. La plaza tuvo una lluvia al revés: discos de luz que trepaban y giraban, cada uno con su prisa. No se chocaban. La fuente los contaba en silencio y los dejaba flotar un segundo antes de empujarlos más alto. Los mayores se quitaban el sombrero. Nadie alargó la mano para cogerlos. No eran botín. Eran deseos de visita.' },
      { scene:'fuente-color', minMs:66000, text:'El agua cambió de color sin avisar. Primero fue azul de pozo, luego verde de menta, luego un dorado suave que no cegaba. Vera entendió que la fuente estaba contenta. El chorro del centro se hizo más alto y las monedas lo usaron como escalera. El campanario dio una campanada, solo una, y las piezas brillaron al mismo tiempo, como si respondieran presente. Vera rio por fin. No era una risa de burla. Era la risa de quien descubre que el mundo todavía guarda trucos amables.' },
      { scene:'fuente-noche', minMs:66000, text:'Cuando llegó la noche, los faroles de la plaza se encendieron y la fuente no se cansó. Seguía contando hacia arriba, más despacio, para no perder ninguna. Las familias se sentaron en los bancos y hablaron bajo. Vera ya no tenía su moneda, y no la echaba de menos. Veía su brillo entre los otros y le bastaba. El abuelo apareció al final de la calle y asintió. No explicó el truco. Solo dijo: mira qué bien cuentan.' },
      { scene:'fuente-luna', minMs:64000, text:'La última moneda de Vera subió más que las demás. Pasó los faroles, pasó el campanario y se quedó un instante delante de la luna, pequeña y valiente. No se perdió. Bajó después en espiral y se posó en el borde, seca, lista por si otro niño la necesitaba. Las demás hicieron lo mismo, hasta dejar la plaza en calma. Vera guardó la suya otra vez, pero ya no la apretaba. Un deseo compartido no se hunde. Se enseña, brilla un rato y vuelve a la mano más ligero.' }
    ]},
    { id:'bosque', title:'El bosque de faroles', parts:[
      { scene:'bosque-dia', minMs:60000, text:'De día el bosque de Doganiero era sombra verde y camino claro. Los troncos estaban separados lo justo para que pasara una cesta. Inés iba a ver a su tía y conocía el sendero de memoria. Llevaba manzanas y una cinta roja en la trenza. Los pájaros hacían cuentas en voz alta. Nada parecía misterioso. Inés saludó a un tocón que le servía de referencia y siguió. El sol se colaba en monedas grandes sobre la tierra. Era temprano, y el bosque todavía no pensaba en la noche.' },
      { scene:'bosque-atardecer', minMs:62000, text:'El atardecer llegó antes de lo que Inés había calculado. El verde se volvió cobre y las sombras de los árboles se alargaron como dedos. El camino seguía ahí, pero ya no brillaba igual. Inés apretó la cesta. El bosque era de su familia desde siempre, aun así bajó el paso. Una hoja seca crujió bajo el zapato y el sonido le pareció enorme. Miró atrás. El pueblo ya no se veía. Miró adelante. Entre dos robles había un punto de luz que no era el sol.' },
      { scene:'bosque-primer', minMs:64000, text:'Era un farol. Pequeño, colgado de una rama baja, con una llama quieta del color del pan tostado. No había cuerda a la vista ni mano que lo hubiera encendido. Inés se acercó y el calor le tocó la mejilla. Recordó el cuento de la tía: cuando el día se rinde, el bosque enciende su propia calle. Inés dijo gracias, y el farol se balanceó un poco, como un sí. El camino, a partir de ahí, ya no estaba solo.' },
      { scene:'bosque-camino', minMs:66000, text:'Más adelante había otro farol, y otro, y otro. No estaban en fila de soldado. Cada uno elegía una rama distinta y dejaba un charco de luz sobre el suelo. Inés fue de charco en charco, como quien cruza un arroyo saltando piedras. Las manzanas olían más fuerte con el calor de las llamas. Un búho la miró sin regañarla. El bosque, que de día era solo árboles, de noche era un relato con puntos y aparte. Inés ya no contaba pasos. Contaba luces.' },
      { scene:'bosque-claro', minMs:64000, text:'El sendero se abrió en un claro redondo. En el centro había un tocón ancho y, alrededor, un círculo de faroles casi a la altura de los ojos. Parecía una mesa puesta para nadie y para todos. Inés dejó una manzana sobre el tocón, por si el bosque tenía hambre de detalles. Los faroles giraron despacio, todos a la vez. Ella se sentó un momento. No había prisa que valiera más que aquel silencio iluminado. Cuando se levantó, la manzana seguía allí, y eso también estaba bien.' },
      { scene:'bosque-luces', minMs:66000, text:'Al salir del claro, el aire se llenó de luces pequeñas que no eran faroles. Subían y bajaban como si respiraran. Luciérnagas, pensó Inés, aunque brillaban con más calma que las de su jardín. Algunas se posaban en la cesta y se iban. Otras dibujaban la curva del camino antes de que sus pies llegaran. Inés rio bajito para no romperles el ritmo. El bosque ya no era una línea recta entre dos casas. Era un lugar que acompañaba. Prometió volver de día a dar las gracias, cuando las luces durmieran.' },
      { scene:'bosque-cabana', minMs:64000, text:'La cabaña de la tía apareció con una ventana encendida y un hilo de humo derecho. En la puerta había un farol más grande, recién dejado en el suelo. La tía salió con un chal y no se sorprendió. Dijo: te han traído bien. Inés asintió y entregó las manzanas. Dentro olía a madera y a sopa. Por la ventana todavía se veían, lejos, los puntos del claro. La tía explicó solo esto: el bosque enciende faroles para quien camina sin hacer daño. Inés guardó la frase como se guarda una llave.' },
      { scene:'bosque-alba', minMs:64000, text:'Inés se quedó a dormir y salió con el alba. La niebla era baja y rosa. Los faroles seguían en las ramas, pero sus llamas eran ya casi transparentes, como quien bosteza. Los pájaros volvieron a sus cuentas. El camino de día estaba donde siempre, sencillo y verde. Inés tocó el primer farol al pasar y lo encontró tibio. No lo apagó. No era suyo. Siguió hacia el pueblo con la cesta vacía y la cinta un poco torcida, segura de que, si otra tarde se le hacía tarde, el bosque sabría encenderle el regreso.' }
    ]},
    { id:'ciudad', title:'La ciudad que duerme de pie', parts:[
      { scene:'ciudad-avenida', minMs:68000, text:'La avenida principal de Doganiero se estiraba entre edificios altos que todavía tenían sol en la frente. Los coches iban despacio, como si ya supieran que la noche merecía respeto. En el portal del número nueve vivía Bruno, un niño que coleccionaba ventanas encendidas. Esa tarde salió con su cuaderno y un lápiz corto. Quería anotar cómo se duerme una ciudad. Su madre le dijo que volviera cuando el primer farol parpadeara. Bruno prometió. El cielo estaba naranja y las fachadas parecían de pan recién hecho.' },
      { scene:'ciudad-cierre', minMs:70000, text:'Las tiendas empezaron a cerrar. Una panadería bajó el toldo verde. Una librería apagó el letrero pero dejó una lámpara pequeña, por costumbre. Bruno apuntó: las tiendas se duermen primero. Un tendero le regaló una galleta y le pidió que no escribiera su nombre. Las sillas de la terraza se apilaron como una torre educada. El ruido de la avenida bajó de volumen sin que nadie girara una rueda. Bruno mordió la galleta y pasó la página. La ciudad estaba bostezando.' },
      { scene:'ciudad-parpadeo', minMs:72000, text:'Luego fueron las ventanas. No se apagaron todas juntas. Unas parpadearon, otras se quedaron medio despiertas, y algunas cambiaron de una luz blanca a una luz de manta. Bruno dibujó cuadraditos y puso estrellas junto a los que seguían abiertos. Le pareció que los edificios tenían párpados. Una cortina se corrió y volvió a abrirse, indecisa. Bruno susurró: está bien, puedes dormirte. La ventana esperó un poco y al final obedeció.' },
      { scene:'ciudad-sereno', minMs:74000, text:'La luna salió por detrás de la torre del reloj e hizo la ronda, despacio, como un sereno sin silbato. Bruno la siguió con el lápiz en el aire. La luna no miraba dentro de las casas. Solo comprobaba que los tejados siguieran en su sitio y que las calles no se hubieran perdido. Pasó sobre la panadería, sobre la librería, sobre el portal del número nueve. Bruno anotó: la luna no despierta a nadie. Le pareció una buena norma. Un farol nuevo se encendió y le recordó la hora de volver.' },
      { scene:'ciudad-vacia', minMs:72000, text:'En el camino de regreso la avenida estaba vacía de coches. Quedaban los faroles, en fila, y el brillo húmedo de las losas. Bruno caminó por el centro porque no venía nadie. Sus pasos sonaban claros. Contó doce faroles hasta su portal. En el cuaderno escribió que una ciudad vacía no está triste si las luces se hacen compañía. Se detuvo a atarse el zapato. La calle esperó. Ni un balcón se quejó. El silencio era blando, de almohada grande.' },
      { scene:'ciudad-gato', minMs:70000, text:'En el tejado de enfrente apareció un gato. Caminó por el borde con la cola en pregunta y se sentó junto a una chimenea dormida. Bruno lo dibujó, porque esta vez el gato posó. Tenía los ojos medio cerrados y las orejas atentas, como la propia ciudad. No maulló. Los gatos de noche guardan las palabras para otra hora. Bruno le enseñó el cuaderno desde abajo. El gato no bajó, pero parpadeó una vez, lento, que Bruno tradujo como: buen trabajo, ve a casa.' },
      { scene:'ciudad-respira', minMs:72000, text:'Antes de entrar, Bruno miró los edificios todos juntos. Le pareció que respiraban. No se tumbaban, porque una ciudad no cabe en una cama. Dormían de pie, hinchando un poco las fachadas y soltando el aire por las rejas. Las ventanas que quedaban encendidas eran sueños que todavía no querían acabarse. Bruno cerró el cuaderno para no gastar más lápiz. Apoyó la mano en la puerta y notó la madera tibia. Detrás, su madre movía una silla. La casa también estaba a punto de dormirse, pero lo había esperado.' },
      { scene:'ciudad-alba', minMs:72000, text:'Bruno se durmió con el cuaderno bajo la almohada y la ciudad cumplió el resto de la noche sin él. Cuando el alba pintó los tejados de rosa, las ventanas volvieron a abrirse de una en una, sin alboroto. La panadería encendió el horno. El gato bajó del tejado. La luna se retiró sin hacer ruido, terminada su ronda. Bruno, ya de mañana, leyó sus apuntes y añadió la última frase: duerme de pie, y por eso sigue aquí cuando despertamos. Cerró el cuaderno. La avenida ya olía otra vez a pan.' }
    ]},
    { id:'barco', title:'El barco de papel en la lluvia', parts:[
      { scene:'barco-mesa', minMs:56000, text:'En la mesa de la cocina, bajo una lámpara amarilla, Rosa dobló una hoja blanca. Su hermano Teo daba instrucciones de un libro: por la mitad, otra vez, las puntas hacia adentro. El papel crujía como un secreto. Fuera todavía no llovía, pero el cielo estaba bajo y gris, de los que prometen charcos. Rosa no quería un barco perfecto. Quería uno que aguantara hasta la otra orilla del patio. Teo puso nombre al barco antes de terminar. Se llama Bruma, dijo. Rosa aceptó.' },
      { scene:'barco-charco', minMs:58000, text:'Salieron al patio con Bruma en las dos manos, como se lleva un pastel. La lluvia aún no caía, y el charco más grande estaba quieto junto a los escalones. Reflejaba la cuerda de tender y una nube. Rosa se arrodilló y dejó el barco en el borde, sin empujarlo. Teo contuvo la respiración. Bruma se mojó la quilla y no se deshizo. El papel tenía esa valentía rara de las cosas pequeñas. Una hormiga dio un rodeo enorme para no subir a bordo. Los niños lo tomaron como un buen augurio.' },
      { scene:'barco-zarpa', minMs:62000, text:'Una gota cayó en el centro del charco y Bruma se movió solo. Luego otra gota, y el barco encontró una corriente mínima que iba hacia los geranios. Rosa no sopló. Quería ver si el viaje era del barco y no de ella. Teo caminó de lado, agachado, narrando en susurros: abandona el puerto, esquiva una hoja, saluda a una piedra. Bruma cabeceó y siguió. La vela de papel, que era solo un pliegue, aguantó. Los niños sintieron esa alegría seria de los juegos que de pronto se vuelven de verdad.' },
      { scene:'barco-lluvia', minMs:64000, text:'Entonces la lluvia se decidió. No fue un diluvio triste. Fue una lluvia pareja, de agujas finas, que picaba el charco y lo volvía un mapa de círculos. Bruma subía y bajaba en cada anillo. Rosa no lo tocó. Teo contó las gotas más cercanas, como si pudiera negociar con ellas. El barco giró sobre sí mismo, mostró la popa y volvió a mirar al frente. Una esquina del papel se oscureció, pero el pliegue principal siguió entero. Bruma era terco, y eso le favorecía.' },
      { scene:'barco-olas', minMs:62000, text:'El charco creció y las olas se volvieron de verdad, aunque fueran olas de patio. Empujaban a Bruma hacia un ladrillo hundido que hacía de arrecife. Teo avisó en voz alta. Rosa puso un dedo en el agua y desvió la corriente lo justo, sin coger el barco. Bruma pasó rozando el ladrillo y salió a una zona más honda, donde el reflejo de la cocina temblaba. Los niños estaban empapados y no entraban. La lámpara de dentro seguía encendida, esperando, pero el viaje todavía no había tocado tierra.' },
      { scene:'barco-orilla', minMs:58000, text:'La otra orilla era el escalón de los geranios. Bruma llegó de lado, se enderezó y se detuvo, como si amarrara solo. La lluvia aflojó hasta volverse tres gotas y después ninguna. El charco quedó liso otra vez. Rosa levantó el barco con las dos manos. Pesaba un poco más y tenía una mancha de tierra honrada en la proa. Teo dijo que había sido una travesía larga, aunque el patio midiera pocos pasos. Entraron a secarlo junto a la lámpara, sin desdoblarlo. Afuera, el charco guardaba todavía los círculos de la lluvia.' }
    ]}
  ];
  function stage(THREE, bg) {
    var scene = new THREE.Scene();
    scene.background = new THREE.Color(bg);
    var camera = new THREE.PerspectiveCamera(48, 1, 0.1, 180);
    var owned = [];
    function mesh(g, m) { owned.push(g); if (m) owned.push(m); return new THREE.Mesh(g, m); }
    function add(o) { scene.add(o); return o; }
    function dispose() {
      scene.traverse(function (obj) {
        if (obj.geometry && obj.geometry.dispose) obj.geometry.dispose();
        if (obj.material) {
          var mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach(function (m) { if (m && m.dispose) m.dispose(); });
        }
      });
      owned.forEach(function (r) { if (r && r.dispose) r.dispose(); });
    }
    return { scene: scene, camera: camera, mesh: mesh, add: add, dispose: dispose };
  }
  function buildScene(key, THREE) {
    var S, sea, pivot, boat, coins, lanterns, windows, drops, moon, train, cat, buildings, water;
    function ret(update) { return { scene: S.scene, camera: S.camera, dispose: S.dispose, update: update }; }
    if (key === 'faro-muelle') {
      S = stage(THREE, 0xc47a45);
      S.camera.position.set(6, 3.2, 8); S.camera.lookAt(0, 0.4, 0);
      S.add(new THREE.AmbientLight(0xffe0c2, 0.7));
      var sun = new THREE.DirectionalLight(0xfff1d0, 0.9); sun.position.set(-4, 6, 3); S.add(sun);
      sea = S.mesh(new THREE.PlaneGeometry(20, 14), new THREE.MeshStandardMaterial({ color: 0x2f6f8a, roughness: 0.3 }));
      sea.rotation.x = -Math.PI / 2; sea.position.z = -1; S.add(sea);
      var dock = S.mesh(new THREE.BoxGeometry(7, 0.25, 2.2), new THREE.MeshStandardMaterial({ color: 0x8a5a32 }));
      dock.position.set(0, 0.4, 2); S.add(dock);
      for (var p = 0; p < 5; p++) {
        var post = S.mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.3, 6), new THREE.MeshStandardMaterial({ color: 0x5c3b22 }));
        post.position.set(-2.4 + p * 1.2, 0.9, 1.1); S.add(post);
      }
      var skiff = S.mesh(new THREE.BoxGeometry(1.4, 0.28, 0.55), new THREE.MeshStandardMaterial({ color: 0xd8c7a1 }));
      skiff.position.set(-1.2, 0.25, -0.4); S.add(skiff);
      var skiff2 = S.mesh(new THREE.BoxGeometry(1.1, 0.24, 0.48), new THREE.MeshStandardMaterial({ color: 0xc47b4a }));
      skiff2.position.set(1.5, 0.22, -1.1); S.add(skiff2);
      return ret(function (t) { sea.position.y = Math.sin(t * 1.2) * 0.05; skiff.position.y = 0.25 + Math.sin(t * 1.5) * 0.06; skiff2.rotation.z = Math.sin(t) * 0.08; });
    }
    if (key === 'faro-acantilado') {
      S = stage(THREE, 0x8aa0b3); S.scene.fog = new THREE.Fog(0xb7c4cf, 6, 18);
      S.camera.position.set(2, 2.4, 8); S.camera.lookAt(0, 1.5, 0);
      S.add(new THREE.HemisphereLight(0xd5e2ee, 0x6d5b48, 0.9));
      var wall = S.mesh(new THREE.BoxGeometry(2.2, 6, 8), new THREE.MeshStandardMaterial({ color: 0x7d858c }));
      wall.position.set(-2.2, 2.2, 0); S.add(wall);
      var path = S.mesh(new THREE.BoxGeometry(1.1, 0.12, 8), new THREE.MeshStandardMaterial({ color: 0xc2b49a }));
      path.position.set(0.2, 0.2, 0); S.add(path);
      for (var r = 0; r < 4; r++) {
        var rock = S.mesh(new THREE.DodecahedronGeometry(0.35 + r * 0.05), new THREE.MeshStandardMaterial({ color: 0x596068 }));
        rock.position.set(1.2, 0.3, -2 + r * 1.3); S.add(rock);
      }
      return ret(function (t) { S.scene.fog.near = 5 + Math.sin(t * 0.4) * 1.2; });
    }
    if (key === 'faro-oscuro') {
      S = stage(THREE, 0x070b14);
      S.camera.position.set(5, 2.5, 7); S.camera.lookAt(0, 2, 0);
      S.add(new THREE.AmbientLight(0x223044, 0.4));
      moon = S.mesh(new THREE.SphereGeometry(0.4, 12, 10), new THREE.MeshBasicMaterial({ color: 0xd9d3c3 }));
      moon.position.set(-3, 4.5, -2); S.add(moon);
      var tower = S.mesh(new THREE.CylinderGeometry(0.55, 0.75, 4.4, 8), new THREE.MeshStandardMaterial({ color: 0x2a3140 }));
      tower.position.y = 2.2; S.add(tower);
      var cap = S.mesh(new THREE.ConeGeometry(0.85, 0.7, 8), new THREE.MeshStandardMaterial({ color: 0x1a1e28 }));
      cap.position.y = 4.6; S.add(cap);
      var ground = S.mesh(new THREE.CircleGeometry(5, 16), new THREE.MeshStandardMaterial({ color: 0x12151c }));
      ground.rotation.x = -Math.PI / 2; S.add(ground);
      return ret(function (t) { moon.position.x = -3 + Math.sin(t * 0.2) * 0.3; });
    }
    if (key === 'faro-niebla') {
      S = stage(THREE, 0xd5dde4); S.scene.fog = new THREE.FogExp2(0xe7eef2, 0.16);
      S.camera.position.set(4, 2, 5); S.camera.lookAt(0, 1.2, 0);
      S.add(new THREE.AmbientLight(0xffffff, 0.55));
      var stub = S.mesh(new THREE.CylinderGeometry(0.4, 0.5, 2.2, 8), new THREE.MeshStandardMaterial({ color: 0xc5c9cf }));
      stub.position.y = 1.1; S.add(stub);
      var lamp = S.mesh(new THREE.SphereGeometry(0.22, 12, 10), new THREE.MeshBasicMaterial({ color: 0xffe7a8 }));
      lamp.position.y = 2.3; S.add(lamp);
      var glow = new THREE.PointLight(0xffe1a3, 0.6, 4); glow.position.y = 2.3; S.add(glow);
      return ret(function (t) { var k = 0.35 + Math.abs(Math.sin(t * 2.2)) * 0.8; lamp.scale.setScalar(0.9 + k * 0.1); glow.intensity = k; });
    }
    if (key === 'faro-haz') {
      S = stage(THREE, 0x163044); S.scene.fog = new THREE.FogExp2(0x9eb4c4, 0.045);
      S.camera.position.set(6.5, 2.6, 7.5); S.camera.lookAt(0, 1.8, 0);
      S.add(new THREE.AmbientLight(0x9fb4c6, 0.45));
      sea = S.mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({ color: 0x1a4e68, metalness: 0.2, roughness: 0.25 }));
      sea.rotation.x = -Math.PI / 2; S.add(sea);
      var tw = S.mesh(new THREE.CylinderGeometry(0.45, 0.62, 4, 10), new THREE.MeshStandardMaterial({ color: 0xe4ddcf }));
      tw.position.y = 2; S.add(tw);
      var roof = S.mesh(new THREE.ConeGeometry(0.75, 0.6, 10), new THREE.MeshStandardMaterial({ color: 0xb43333 }));
      roof.position.y = 4.2; S.add(roof);
      pivot = new THREE.Group(); pivot.position.y = 3.7; S.add(pivot);
      var beam = S.mesh(new THREE.ConeGeometry(0.4, 3.6, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff3c0, transparent: true, opacity: 0.4, side: THREE.DoubleSide }));
      beam.rotation.z = Math.PI / 2; beam.position.x = 1.8; pivot.add(beam);
      return ret(function (t) { pivot.rotation.y = t * 0.65; sea.position.y = Math.sin(t) * 0.04; });
    }
    if (key === 'faro-regreso') {
      S = stage(THREE, 0x1a3044); S.scene.fog = new THREE.Fog(0xc5d0da, 8, 22);
      S.camera.position.set(0, 2.2, 9); S.camera.lookAt(0, 1, 0);
      S.add(new THREE.AmbientLight(0xb9c8d4, 0.5));
      var mini = S.mesh(new THREE.CylinderGeometry(0.28, 0.34, 2.2, 8), new THREE.MeshStandardMaterial({ color: 0xeee6d6 }));
      mini.position.set(-3.2, 1.1, -1); S.add(mini);
      var bulb = S.mesh(new THREE.SphereGeometry(0.12, 8, 8), new THREE.MeshBasicMaterial({ color: 0xfff1b0 }));
      bulb.position.set(-3.2, 2.3, -1); S.add(bulb);
      sea = S.mesh(new THREE.PlaneGeometry(24, 12), new THREE.MeshStandardMaterial({ color: 0x24566e }));
      sea.rotation.x = -Math.PI / 2; S.add(sea);
      boat = new THREE.Group();
      boat.add(S.mesh(new THREE.BoxGeometry(1.8, 0.4, 0.7), new THREE.MeshStandardMaterial({ color: 0x24344c })));
      var winMat = new THREE.MeshBasicMaterial({ color: 0xffd27a });
      for (var w = 0; w < 3; w++) {
        var win = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.16), winMat);
        win.position.set(-0.45 + w * 0.4, 0.15, 0.36); boat.add(win);
      }
      S.add(boat);
      return ret(function (t) { var u = (t * 0.18) % 1; boat.position.set(4 - u * 8, Math.sin(t * 1.6) * 0.08, -1); });
    }
    if (key === 'tren-anden') {
      S = stage(THREE, 0x141822);
      S.camera.position.set(4, 2.4, 7); S.camera.lookAt(0, 1, 0);
      S.add(new THREE.AmbientLight(0x334455, 0.6));
      var plat = S.mesh(new THREE.BoxGeometry(8, 0.3, 2.4), new THREE.MeshStandardMaterial({ color: 0x6b5644 }));
      plat.position.set(0, 0.4, 1.4); S.add(plat);
      var bench = S.mesh(new THREE.BoxGeometry(1.4, 0.12, 0.4), new THREE.MeshStandardMaterial({ color: 0x8d6a45 }));
      bench.position.set(-1.5, 0.8, 1.5); S.add(bench);
      var clock = S.mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.08, 16), new THREE.MeshStandardMaterial({ color: 0xf2efe4 }));
      clock.rotation.x = Math.PI / 2; clock.position.set(2.2, 2.1, 0.2); S.add(clock);
      var lampP = new THREE.PointLight(0xffe0a8, 1.1, 6); lampP.position.set(0, 2.4, 1.6); S.add(lampP);
      var pole = S.mesh(new THREE.CylinderGeometry(0.05, 0.05, 2, 6), new THREE.MeshStandardMaterial({ color: 0x222222 }));
      pole.position.set(0, 1.4, 1.6); S.add(pole);
      return ret(function (t) { clock.rotation.z = t * 0.3; lampP.intensity = 0.8 + Math.sin(t * 2) * 0.15; });
    }
    if (key === 'tren-farol') {
      S = stage(THREE, 0x05060c);
      S.camera.position.set(0, 1.6, 4); S.camera.lookAt(0, 1.2, 0);
      S.add(new THREE.AmbientLight(0x111522, 0.3));
      pivot = new THREE.Group(); pivot.position.y = 2.2; S.add(pivot);
      var handle = S.mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.6, 5), new THREE.MeshStandardMaterial({ color: 0x888888 }));
      handle.position.y = -0.3; pivot.add(handle);
      var cage = S.mesh(new THREE.BoxGeometry(0.28, 0.34, 0.28), new THREE.MeshStandardMaterial({ color: 0x665533, metalness: 0.4 }));
      cage.position.y = -0.7; pivot.add(cage);
      var flame = S.mesh(new THREE.SphereGeometry(0.08, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffb347 }));
      flame.position.y = -0.7; pivot.add(flame);
      var pl = new THREE.PointLight(0xffaa44, 1.4, 5); pl.position.y = -0.7; pivot.add(pl);
      return ret(function (t) { pivot.rotation.z = Math.sin(t * 1.6) * 0.35; });
    }
    if (key === 'tren-llega') {
      S = stage(THREE, 0x0c1018);
      S.camera.position.set(0, 2, 8); S.camera.lookAt(0, 0.6, 0);
      S.add(new THREE.AmbientLight(0x223344, 0.5));
      var railMat = new THREE.MeshStandardMaterial({ color: 0x99aaaa, metalness: 0.5 });
      [-0.3, 0.3].forEach(function (z) {
        var rail = S.mesh(new THREE.BoxGeometry(16, 0.05, 0.08), railMat);
        rail.position.set(0, 0.1, z); S.add(rail);
      });
      train = new THREE.Group();
      var eng = S.mesh(new THREE.BoxGeometry(1.6, 0.9, 0.8), new THREE.MeshStandardMaterial({ color: 0x1e2a44 }));
      train.add(eng);
      var eye = S.mesh(new THREE.SphereGeometry(0.12, 8, 8), new THREE.MeshBasicMaterial({ color: 0xfff6d0 }));
      eye.position.set(0.85, 0.1, 0); train.add(eye);
      S.add(train);
      return ret(function (t) { train.position.x = 7 - (t % 8); });
    }
    if (key === 'tren-vagones') {
      S = stage(THREE, 0x10141c);
      S.camera.position.set(0, 1.5, 5.5); S.camera.lookAt(0, 0.7, 0);
      S.add(new THREE.AmbientLight(0x334455, 0.45));
      train = new THREE.Group();
      var colors = [0x243e73, 0x7a3148, 0x245c45];
      for (var i = 0; i < 3; i++) {
        var wagon = S.mesh(new THREE.BoxGeometry(1.5, 0.85, 0.8), new THREE.MeshStandardMaterial({ color: colors[i] }));
        wagon.position.x = -2 + i * 1.8; train.add(wagon);
        for (var k = 0; k < 2; k++) {
          var ww = S.mesh(new THREE.PlaneGeometry(0.28, 0.2), new THREE.MeshBasicMaterial({ color: 0xffd89a }));
          ww.position.set(-2 + i * 1.8 - 0.25 + k * 0.5, 0.15, 0.41); train.add(ww);
        }
      }
      S.add(train);
      return ret(function (t) { train.position.x = Math.sin(t * 0.45) * 1.4; });
    }
    if (key === 'tren-tunel') {
      S = stage(THREE, 0x000000);
      S.camera.position.set(0, 1.2, 6); S.camera.lookAt(0, 0.8, 0);
      var tube = S.mesh(new THREE.CylinderGeometry(1.8, 1.8, 10, 16, 1, true), new THREE.MeshStandardMaterial({ color: 0x121212, side: THREE.BackSide }));
      tube.rotation.x = Math.PI / 2; S.add(tube);
      train = new THREE.Group();
      for (var n = 0; n < 4; n++) {
        var glowW = S.mesh(new THREE.PlaneGeometry(0.35, 0.22), new THREE.MeshBasicMaterial({ color: 0xffe2a8 }));
        glowW.position.set(-1.5 + n * 0.9, 0.4, 0); train.add(glowW);
      }
      S.add(train);
      return ret(function (t) { train.position.z = Math.sin(t * 0.8) * 1.5; });
    }
    if (key === 'tren-puente') {
      S = stage(THREE, 0x0b1424);
      S.camera.position.set(7, 3, 7); S.camera.lookAt(0, 1, 0);
      S.add(new THREE.AmbientLight(0x223344, 0.5));
      moon = S.mesh(new THREE.SphereGeometry(0.45, 12, 10), new THREE.MeshBasicMaterial({ color: 0xf4f0dc }));
      moon.position.set(-3, 4.2, -2); S.add(moon);
      water = S.mesh(new THREE.PlaneGeometry(14, 8), new THREE.MeshStandardMaterial({ color: 0x16324a, metalness: 0.35, roughness: 0.2 }));
      water.rotation.x = -Math.PI / 2; water.position.y = -0.6; S.add(water);
      var deck = S.mesh(new THREE.BoxGeometry(8, 0.15, 1.2), new THREE.MeshStandardMaterial({ color: 0x6a6258 }));
      deck.position.y = 1.1; S.add(deck);
      [-2.4, 2.4].forEach(function (x) {
        var pil = S.mesh(new THREE.CylinderGeometry(0.18, 0.22, 1.8, 6), new THREE.MeshStandardMaterial({ color: 0x3e4a3a }));
        pil.position.set(x, 0.2, 0); S.add(pil);
      });
      train = S.mesh(new THREE.BoxGeometry(1.3, 0.45, 0.55), new THREE.MeshStandardMaterial({ color: 0x2a3f6b }));
      train.position.y = 1.45; S.add(train);
      return ret(function (t) { train.position.x = Math.sin(t * 0.5) * 2.6; water.position.y = -0.6 + Math.sin(t) * 0.03; });
    }
    if (key === 'tren-pueblo') {
      S = stage(THREE, 0x1a140e);
      S.camera.position.set(5, 2.6, 7); S.camera.lookAt(0, 0.8, 0);
      S.add(new THREE.AmbientLight(0x443322, 0.55));
      [[-2.2, 0x8d4d3a], [0, 0xc4b08a], [2.2, 0x6e7f5a]].forEach(function (h) {
        var house = S.mesh(new THREE.BoxGeometry(1.3, 1.1, 1.1), new THREE.MeshStandardMaterial({ color: h[1] }));
        house.position.set(h[0], 0.55, -1.2); S.add(house);
        var roofH = S.mesh(new THREE.ConeGeometry(1.05, 0.55, 4), new THREE.MeshStandardMaterial({ color: 0x5a2e24 }));
        roofH.position.set(h[0], 1.3, -1.2); roofH.rotation.y = Math.PI / 4; S.add(roofH);
        var lw = S.mesh(new THREE.PlaneGeometry(0.25, 0.25), new THREE.MeshBasicMaterial({ color: 0xffe1a0 }));
        lw.position.set(h[0], 0.7, -0.64); S.add(lw);
      });
      train = S.mesh(new THREE.BoxGeometry(2.4, 0.6, 0.7), new THREE.MeshStandardMaterial({ color: 0x243656 }));
      train.position.set(0.4, 0.45, 1.3); S.add(train);
      return ret(function (t) { train.position.x = 0.4 + Math.sin(t * 0.4) * 0.15; });
    }
    if (key === 'fuente-dia') {
      S = stage(THREE, 0x87b8d8);
      S.camera.position.set(5, 3.5, 6); S.camera.lookAt(0, 0.6, 0);
      var day = new THREE.DirectionalLight(0xfff4d8, 1); day.position.set(4, 8, 2); S.add(day);
      S.add(new THREE.AmbientLight(0xffffff, 0.45));
      var plaza = S.mesh(new THREE.CircleGeometry(5, 24), new THREE.MeshStandardMaterial({ color: 0xd9c7a4 }));
      plaza.rotation.x = -Math.PI / 2; S.add(plaza);
      var basin = S.mesh(new THREE.CylinderGeometry(1.2, 1.3, 0.4, 18), new THREE.MeshStandardMaterial({ color: 0x9aa7b2 }));
      basin.position.y = 0.3; S.add(basin);
      water = S.mesh(new THREE.CylinderGeometry(1, 1, 0.12, 16), new THREE.MeshStandardMaterial({ color: 0x3aa0c8, transparent: true, opacity: 0.8 }));
      water.position.y = 0.48; S.add(water);
      var bench = S.mesh(new THREE.BoxGeometry(1.2, 0.12, 0.35), new THREE.MeshStandardMaterial({ color: 0x7a5230 }));
      bench.position.set(2.2, 0.3, 1.4); S.add(bench);
      return ret(function (t) { water.position.y = 0.48 + Math.sin(t * 1.4) * 0.02; });
    }
    if (key === 'fuente-ninos') {
      S = stage(THREE, 0x9ec4dd);
      S.camera.position.set(4.5, 2.8, 6); S.camera.lookAt(0, 0.7, 0);
      S.add(new THREE.AmbientLight(0xffffff, 0.6));
      var base = S.mesh(new THREE.CylinderGeometry(0.9, 1, 0.35, 14), new THREE.MeshStandardMaterial({ color: 0xaeb8c2 }));
      base.position.y = 0.2; S.add(base);
      var cols = [0xe07a5f, 0x3d5a80, 0x81b29a, 0xf2cc8f];
      var kids = [];
      for (var c = 0; c < 4; c++) {
        var kid = S.mesh(new THREE.CapsuleGeometry(0.16, 0.35, 3, 6), new THREE.MeshStandardMaterial({ color: cols[c] }));
        var ang = c / 4 * Math.PI * 2;
        kid.position.set(Math.cos(ang) * 1.7, 0.45, Math.sin(ang) * 1.7);
        S.add(kid); kids.push(kid);
      }
      return ret(function (t) { kids.forEach(function (kid, idx) { kid.position.y = 0.45 + Math.sin(t * 2 + idx) * 0.05; }); });
    }
    if (key === 'fuente-una') {
      S = stage(THREE, 0x24606a);
      S.camera.position.set(3.5, 2.2, 4.5); S.camera.lookAt(0, 1, 0);
      S.add(new THREE.AmbientLight(0xccffee, 0.4));
      var bowl = S.mesh(new THREE.CylinderGeometry(0.8, 0.9, 0.3, 16), new THREE.MeshStandardMaterial({ color: 0x8e9aa6, metalness: 0.3 }));
      bowl.position.y = 0.2; S.add(bowl);
      var coin = S.mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.04, 12), new THREE.MeshStandardMaterial({ color: 0xf5c542, metalness: 0.7 }));
      S.add(coin);
      var jet = S.mesh(new THREE.CylinderGeometry(0.04, 0.06, 1.2, 8), new THREE.MeshBasicMaterial({ color: 0x9eecff, transparent: true, opacity: 0.6 }));
      jet.position.y = 0.8; S.add(jet);
      return ret(function (t) { var u = (t * 0.35) % 1; coin.position.y = 0.4 + u * 2.2; coin.rotation.x = Math.PI / 2; coin.rotation.z = t * 2; });
    }
    if (key === 'fuente-lluvia') {
      S = stage(THREE, 0x12343a);
      S.camera.position.set(4, 3, 6); S.camera.lookAt(0, 1.2, 0);
      S.add(new THREE.AmbientLight(0xffffff, 0.35));
      var up = new THREE.DirectionalLight(0xffe7b0, 0.8); up.position.set(2, 6, 3); S.add(up);
      var b2 = S.mesh(new THREE.CylinderGeometry(1.1, 1.2, 0.35, 16), new THREE.MeshStandardMaterial({ color: 0x90a0aa }));
      b2.position.y = 0.2; S.add(b2);
      coins = [];
      var cmat = new THREE.MeshStandardMaterial({ color: 0xf0c84a, metalness: 0.65 });
      for (var q = 0; q < 10; q++) {
        var cc = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.03, 10), cmat);
        S.add(cc); coins.push(cc);
      }
      return ret(function (t) {
        coins.forEach(function (cc, i) {
          var u = (t * 0.4 + i * 0.1) % 1; var a = i + t * 0.5;
          cc.position.set(Math.cos(a) * (0.3 + u), 0.4 + u * 2.6, Math.sin(a) * (0.3 + u));
          cc.rotation.x = Math.PI / 2;
        });
      });
    }
    if (key === 'fuente-color') {
      S = stage(THREE, 0x10243a);
      S.camera.position.set(3.2, 2.4, 4.2); S.camera.lookAt(0, 0.8, 0);
      var spot = new THREE.SpotLight(0x66f0ff, 2, 12, 0.6, 0.4); spot.position.set(0, 4, 2); S.add(spot);
      S.add(new THREE.AmbientLight(0x224466, 0.4));
      var pool = S.mesh(new THREE.CylinderGeometry(1.15, 1.15, 0.2, 20), new THREE.MeshStandardMaterial({ color: 0x3ec1d8, emissive: 0x114455 }));
      pool.position.y = 0.3; S.add(pool);
      var col = S.mesh(new THREE.CylinderGeometry(0.1, 0.16, 1.8, 8), new THREE.MeshBasicMaterial({ color: 0x88ffe0, transparent: true, opacity: 0.7 }));
      col.position.y = 1.2; S.add(col);
      return ret(function (t) {
        var hue = (t * 0.15) % 1;
        pool.material.color.setHSL(hue, 0.6, 0.5);
        pool.material.emissive.setHSL(hue, 0.8, 0.25);
        col.material.color.setHSL((hue + 0.1) % 1, 0.7, 0.6);
        col.scale.y = 0.8 + Math.sin(t * 2) * 0.15;
      });
    }
    if (key === 'fuente-noche') {
      S = stage(THREE, 0x0b1020);
      S.camera.position.set(6, 3.2, 6); S.camera.lookAt(0, 0.8, 0);
      S.add(new THREE.AmbientLight(0x223344, 0.35));
      var floor = S.mesh(new THREE.CircleGeometry(6, 20), new THREE.MeshStandardMaterial({ color: 0x2a241c }));
      floor.rotation.x = -Math.PI / 2; S.add(floor);
      var fount = S.mesh(new THREE.CylinderGeometry(0.7, 0.8, 0.4, 12), new THREE.MeshStandardMaterial({ color: 0x666677 }));
      fount.position.y = 0.3; S.add(fount);
      for (var L = 0; L < 4; L++) {
        var angL = L / 4 * Math.PI * 2;
        var poleL = S.mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.8, 5), new THREE.MeshStandardMaterial({ color: 0x222222 }));
        poleL.position.set(Math.cos(angL) * 3, 0.9, Math.sin(angL) * 3); S.add(poleL);
        var pln = new THREE.PointLight(0xffc56b, 0.8, 4);
        pln.position.set(Math.cos(angL) * 3, 1.8, Math.sin(angL) * 3); S.add(pln);
      }
      coins = [];
      for (var m = 0; m < 6; m++) {
        var cn = S.mesh(new THREE.SphereGeometry(0.06, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffe08a }));
        S.add(cn); coins.push(cn);
      }
      return ret(function (t) {
        coins.forEach(function (cn, i) {
          cn.position.set(Math.cos(i) * 0.3, 0.8 + ((t * 0.25 + i * 0.16) % 1) * 1.6, Math.sin(i) * 0.3);
        });
      });
    }
    if (key === 'fuente-luna') {
      S = stage(THREE, 0x070a16);
      S.camera.position.set(0, 1.6, 7); S.camera.lookAt(0, 2.2, 0);
      moon = S.mesh(new THREE.SphereGeometry(0.9, 18, 14), new THREE.MeshBasicMaterial({ color: 0xf6f1cf }));
      moon.position.set(0, 4.2, -1); S.add(moon);
      var one = S.mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.04, 12), new THREE.MeshStandardMaterial({ color: 0xf5c542, metalness: 0.8 }));
      S.add(one); S.add(new THREE.AmbientLight(0x445566, 0.4));
      return ret(function (t) { var u = (Math.sin(t * 0.45) + 1) / 2; one.position.set(0, 0.4 + u * 3.6, 0.6); one.rotation.z = t; one.rotation.x = 0.6; });
    }
    if (key === 'bosque-dia') {
      S = stage(THREE, 0x8fd0a4);
      S.camera.position.set(0, 2, 8); S.camera.lookAt(0, 1.2, 0);
      var ds = new THREE.DirectionalLight(0xfff6d8, 0.9); ds.position.set(3, 6, 4); S.add(ds);
      S.add(new THREE.AmbientLight(0xffffff, 0.35));
      var soil = S.mesh(new THREE.PlaneGeometry(16, 16), new THREE.MeshStandardMaterial({ color: 0x3d6b32 }));
      soil.rotation.x = -Math.PI / 2; S.add(soil);
      var pathD = S.mesh(new THREE.PlaneGeometry(1.2, 10), new THREE.MeshStandardMaterial({ color: 0xc2ae86 }));
      pathD.rotation.x = -Math.PI / 2; pathD.position.y = 0.02; S.add(pathD);
      for (var ti = 0; ti < 6; ti++) {
        var trunk = S.mesh(new THREE.CylinderGeometry(0.12, 0.16, 1.2, 6), new THREE.MeshStandardMaterial({ color: 0x6b4428 }));
        var leaf = S.mesh(new THREE.ConeGeometry(0.55, 1.3, 7), new THREE.MeshStandardMaterial({ color: 0x1f8a3a }));
        var x = (ti % 2 ? 1.5 : -1.5), z = -2 + ti;
        trunk.position.set(x, 0.6, z); leaf.position.set(x, 1.6, z); S.add(trunk); S.add(leaf);
      }
      return ret(function (t) { S.camera.position.x = Math.sin(t * 0.3) * 0.4; });
    }
    if (key === 'bosque-atardecer') {
      S = stage(THREE, 0xd07a3a); S.scene.fog = new THREE.Fog(0xe8a06a, 7, 16);
      S.camera.position.set(1, 1.8, 7); S.camera.lookAt(0, 1, 0);
      var sun = new THREE.DirectionalLight(0xff9444, 1.1); sun.position.set(-6, 2, 2); S.add(sun);
      S.add(new THREE.AmbientLight(0x663311, 0.35));
      for (var a = 0; a < 5; a++) {
        var tr = S.mesh(new THREE.CylinderGeometry(0.15, 0.2, 2.4, 5), new THREE.MeshStandardMaterial({ color: 0x4a2c1a }));
        tr.position.set(-2 + a, 1.2, -1 - (a % 2)); tr.rotation.z = -0.15; S.add(tr);
      }
      var groundA = S.mesh(new THREE.PlaneGeometry(14, 10), new THREE.MeshStandardMaterial({ color: 0x6a3a22 }));
      groundA.rotation.x = -Math.PI / 2; S.add(groundA);
      return ret(function (t) { sun.intensity = 0.7 + Math.sin(t * 0.5) * 0.2; });
    }
    if (key === 'bosque-primer') {
      S = stage(THREE, 0x0c1a12);
      S.camera.position.set(2, 1.6, 4); S.camera.lookAt(0, 1.4, 0);
      S.add(new THREE.AmbientLight(0x0a1a10, 0.4));
      var tree = S.mesh(new THREE.CylinderGeometry(0.2, 0.25, 2.5, 6), new THREE.MeshStandardMaterial({ color: 0x3a2416 }));
      tree.position.set(-0.6, 1.25, 0); S.add(tree);
      lanterns = new THREE.Group();
      lanterns.add(S.mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffc56b })));
      var l1 = new THREE.PointLight(0xffb347, 1.5, 5); lanterns.add(l1);
      lanterns.position.set(0.2, 1.6, 0.4); S.add(lanterns);
      return ret(function (t) { lanterns.position.y = 1.6 + Math.sin(t * 1.3) * 0.08; });
    }
    if (key === 'bosque-camino') {
      S = stage(THREE, 0x07140e); S.scene.fog = new THREE.FogExp2(0x0c2418, 0.09);
      S.camera.position.set(0, 1.8, 7); S.camera.lookAt(0, 1, -1);
      S.add(new THREE.AmbientLight(0x112233, 0.4));
      var walk = S.mesh(new THREE.PlaneGeometry(1.4, 12), new THREE.MeshStandardMaterial({ color: 0x3a3428 }));
      walk.rotation.x = -Math.PI / 2; S.add(walk);
      lanterns = [];
      for (var li = 0; li < 6; li++) {
        var g = new THREE.Group();
        g.add(S.mesh(new THREE.SphereGeometry(0.12, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffc56b })));
        g.add(new THREE.PointLight(0xffb347, 0.9, 3.5));
        g.position.set(li % 2 ? 0.8 : -0.8, 1.5, -3 + li * 1.1);
        S.add(g); lanterns.push(g);
      }
      return ret(function (t) { lanterns.forEach(function (g, i) { g.position.y = 1.5 + Math.sin(t * 1.4 + i) * 0.12; }); });
    }
    if (key === 'bosque-claro') {
      S = stage(THREE, 0x0a1810);
      S.camera.position.set(0, 3.2, 6); S.camera.lookAt(0, 0.6, 0);
      S.add(new THREE.AmbientLight(0x114433, 0.35));
      var stump = S.mesh(new THREE.CylinderGeometry(0.45, 0.5, 0.4, 8), new THREE.MeshStandardMaterial({ color: 0x6b4a2e }));
      stump.position.y = 0.2; S.add(stump);
      var apple = S.mesh(new THREE.SphereGeometry(0.1, 8, 8), new THREE.MeshStandardMaterial({ color: 0xc0392b }));
      apple.position.y = 0.48; S.add(apple);
      lanterns = [];
      for (var ri = 0; ri < 8; ri++) {
        var gg = new THREE.Group();
        gg.add(S.mesh(new THREE.SphereGeometry(0.1, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffd59a })));
        gg.add(new THREE.PointLight(0xffc56b, 0.6, 2.5));
        var aa = ri / 8 * Math.PI * 2;
        gg.position.set(Math.cos(aa) * 1.8, 1.2, Math.sin(aa) * 1.8);
        gg.userData.ang = aa; S.add(gg); lanterns.push(gg);
      }
      return ret(function (t) {
        lanterns.forEach(function (g) {
          var aa = g.userData.ang + t * 0.25;
          g.position.x = Math.cos(aa) * 1.8; g.position.z = Math.sin(aa) * 1.8;
        });
      });
    }
    if (key === 'bosque-luces') {
      S = stage(THREE, 0x06110c);
      S.camera.position.set(0, 1.5, 5); S.camera.lookAt(0, 1.4, 0);
      S.add(new THREE.AmbientLight(0x002211, 0.5));
      var bugs = [];
      for (var b = 0; b < 18; b++) {
        var bug = S.mesh(new THREE.SphereGeometry(0.05, 6, 6), new THREE.MeshBasicMaterial({ color: 0xd6ff6b }));
        bug.userData.s = b * 0.7; S.add(bug); bugs.push(bug);
      }
      return ret(function (t) {
        bugs.forEach(function (bug, i) {
          bug.position.set(Math.sin(t * 0.7 + bug.userData.s) * 2, 0.6 + (i % 6) * 0.3 + Math.sin(t + i) * 0.2, Math.cos(t * 0.5 + i) * 2);
          bug.visible = Math.sin(t * 3 + i) > -0.2;
        });
      });
    }
    if (key === 'bosque-cabana') {
      S = stage(THREE, 0x120e0c);
      S.camera.position.set(4, 2.2, 6); S.camera.lookAt(0, 0.8, 0);
      S.add(new THREE.AmbientLight(0x332211, 0.4));
      var cab = S.mesh(new THREE.BoxGeometry(1.8, 1.2, 1.4), new THREE.MeshStandardMaterial({ color: 0x6e4b32 }));
      cab.position.y = 0.6; S.add(cab);
      var rf = S.mesh(new THREE.ConeGeometry(1.5, 0.7, 4), new THREE.MeshStandardMaterial({ color: 0x4a3024 }));
      rf.position.y = 1.5; rf.rotation.y = Math.PI / 4; S.add(rf);
      var winC = S.mesh(new THREE.PlaneGeometry(0.4, 0.35), new THREE.MeshBasicMaterial({ color: 0xffe1a8 }));
      winC.position.set(0, 0.7, 0.71); S.add(winC);
      var smoke = [];
      for (var s = 0; s < 4; s++) {
        var puff = S.mesh(new THREE.SphereGeometry(0.12, 8, 8), new THREE.MeshBasicMaterial({ color: 0xdddddd, transparent: true, opacity: 0.35 }));
        S.add(puff); smoke.push(puff);
      }
      var doorL = new THREE.PointLight(0xffc56b, 0.8, 4); doorL.position.set(1.2, 0.4, 1); S.add(doorL);
      return ret(function (t) { smoke.forEach(function (puff, i) { var u = (t * 0.3 + i * 0.25) % 1; puff.position.set(0.2, 1.8 + u * 1.4, 0); puff.scale.setScalar(0.6 + u); }); });
    }
    if (key === 'bosque-alba') {
      S = stage(THREE, 0xf0c2c8); S.scene.fog = new THREE.Fog(0xf6d5d8, 6, 16);
      S.camera.position.set(0, 2, 7); S.camera.lookAt(0, 1, 0);
      S.add(new THREE.HemisphereLight(0xffe0e4, 0x88aa88, 0.9));
      var floorB = S.mesh(new THREE.PlaneGeometry(14, 12), new THREE.MeshStandardMaterial({ color: 0x7d9a6a }));
      floorB.rotation.x = -Math.PI / 2; S.add(floorB);
      var birds = [];
      for (var bi = 0; bi < 4; bi++) {
        var bird = S.mesh(new THREE.ConeGeometry(0.12, 0.35, 4), new THREE.MeshStandardMaterial({ color: 0x333333 }));
        bird.rotation.z = Math.PI / 2; S.add(bird); birds.push(bird);
      }
      var dim = S.mesh(new THREE.SphereGeometry(0.1, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffe0b0, transparent: true, opacity: 0.35 }));
      dim.position.set(-1, 1.4, 0); S.add(dim);
      return ret(function (t) { birds.forEach(function (bird, i) { bird.position.set(-3 + ((t * 0.8 + i) % 6), 2 + Math.sin(t + i) * 0.3, -1 + i * 0.3); }); });
    }
    if (key === 'ciudad-avenida') {
      S = stage(THREE, 0xf2a65a);
      S.camera.position.set(6, 3, 8); S.camera.lookAt(0, 1, 0);
      var low = new THREE.DirectionalLight(0xffb15a, 1); low.position.set(-5, 3, 4); S.add(low);
      S.add(new THREE.AmbientLight(0xffffee, 0.3));
      var road = S.mesh(new THREE.BoxGeometry(2, 0.08, 12), new THREE.MeshStandardMaterial({ color: 0x33363d }));
      S.add(road);
      [1.6, 2.4, 1.3, 2.8].forEach(function (h, i) {
        var bld = S.mesh(new THREE.BoxGeometry(1, h, 1), new THREE.MeshStandardMaterial({ color: i % 2 ? 0xd98b6a : 0xe6c29a }));
        bld.position.set(i < 2 ? -2 : 2, h / 2, -2 + (i % 2) * 2); S.add(bld);
      });
      var car = S.mesh(new THREE.BoxGeometry(0.7, 0.3, 0.4), new THREE.MeshStandardMaterial({ color: 0x2255aa }));
      car.position.y = 0.25; S.add(car);
      return ret(function (t) { car.position.z = 3 - (t % 6); });
    }
    if (key === 'ciudad-cierre') {
      S = stage(THREE, 0x5c6b8a);
      S.camera.position.set(4, 2, 6); S.camera.lookAt(0, 0.8, 0);
      S.add(new THREE.AmbientLight(0xaabbcc, 0.5));
      var shop = S.mesh(new THREE.BoxGeometry(2.2, 1.3, 1.2), new THREE.MeshStandardMaterial({ color: 0xd8d0c4 }));
      shop.position.y = 0.65; S.add(shop);
      var awning = S.mesh(new THREE.BoxGeometry(2.3, 0.08, 0.7), new THREE.MeshStandardMaterial({ color: 0x2f8f5b }));
      awning.position.set(0, 1.15, 0.7); S.add(awning);
      var sign = S.mesh(new THREE.BoxGeometry(0.8, 0.25, 0.05), new THREE.MeshStandardMaterial({ color: 0x333333, emissive: 0x221100 }));
      sign.position.set(0, 0.9, 0.62); S.add(sign);
      return ret(function (t) { awning.position.y = 1.15 - Math.min(0.45, t * 0.05); sign.material.emissive.set(Math.sin(t * 2) > 0 ? 0xffcc77 : 0x000000); });
    }
    if (key === 'ciudad-parpadeo') {
      S = stage(THREE, 0x0b1020);
      S.camera.position.set(7, 3.5, 8); S.camera.lookAt(0, 1.4, 0);
      S.add(new THREE.AmbientLight(0x1a2744, 0.7));
      windows = [];
      [[-2.4, 2.2], [-0.6, 3], [1.4, 1.8], [3, 2.6]].forEach(function (sp) {
        var bld = S.mesh(new THREE.BoxGeometry(1.1, sp[1], 1), new THREE.MeshStandardMaterial({ color: 0x2c3548 }));
        bld.position.set(sp[0], sp[1] / 2, 0); S.add(bld);
        for (var k = 0; k < 3; k++) {
          var mat = new THREE.MeshBasicMaterial({ color: 0x2a3144 });
          var win = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.18), mat);
          win.position.set(sp[0], 0.4 + k * (sp[1] / 3.5), 0.52);
          S.add(win); windows.push(win);
        }
      });
      return ret(function (t) { windows.forEach(function (win, i) { win.material.color.set(Math.sin(t * 1.8 + i * 1.1) > 0.1 ? 0xf6e7b0 : 0x2a3144); }); });
    }
    if (key === 'ciudad-sereno') {
      S = stage(THREE, 0x101828);
      S.camera.position.set(0, 2, 8); S.camera.lookAt(0, 2, 0);
      moon = S.mesh(new THREE.SphereGeometry(0.45, 14, 12), new THREE.MeshBasicMaterial({ color: 0xf3edd4 }));
      S.add(moon);
      var street = S.mesh(new THREE.PlaneGeometry(6, 14), new THREE.MeshStandardMaterial({ color: 0x1c2230 }));
      street.rotation.x = -Math.PI / 2; S.add(street);
      var towerC = S.mesh(new THREE.BoxGeometry(0.6, 3.2, 0.6), new THREE.MeshStandardMaterial({ color: 0x3a4258 }));
      towerC.position.set(2.2, 1.6, -2); S.add(towerC);
      return ret(function (t) { moon.position.set(Math.sin(t * 0.25) * 3, 3.2, -3); });
    }
    if (key === 'ciudad-vacia') {
      S = stage(THREE, 0x12151c);
      S.camera.position.set(0, 1.5, 6); S.camera.lookAt(0, 0.8, -2);
      S.add(new THREE.AmbientLight(0x222233, 0.3));
      var slabs = S.mesh(new THREE.PlaneGeometry(3, 12), new THREE.MeshStandardMaterial({ color: 0x2a313c, roughness: 0.2, metalness: 0.25 }));
      slabs.rotation.x = -Math.PI / 2; S.add(slabs);
      for (var lp = 0; lp < 6; lp++) {
        var po = S.mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 5), new THREE.MeshStandardMaterial({ color: 0x111111 }));
        po.position.set(lp % 2 ? 1.1 : -1.1, 0.8, -3 + lp); S.add(po);
        var gl = new THREE.PointLight(0xffe0b0, 0.7, 3);
        gl.position.set(lp % 2 ? 1.1 : -1.1, 1.6, -3 + lp); S.add(gl);
      }
      return ret(function (t) { S.camera.position.z = 6 - Math.min(2, t * 0.12); });
    }
    if (key === 'ciudad-gato') {
      S = stage(THREE, 0x16141c);
      S.camera.position.set(3, 2.4, 5); S.camera.lookAt(0, 1.6, 0);
      S.add(new THREE.AmbientLight(0x334455, 0.5));
      var roof = S.mesh(new THREE.BoxGeometry(3.5, 0.15, 2), new THREE.MeshStandardMaterial({ color: 0x5a4038 }));
      roof.position.y = 1.5; S.add(roof);
      var chim = S.mesh(new THREE.BoxGeometry(0.3, 0.6, 0.3), new THREE.MeshStandardMaterial({ color: 0x777777 }));
      chim.position.set(1, 1.85, 0); S.add(chim);
      cat = new THREE.Group();
      var body = S.mesh(new THREE.CapsuleGeometry(0.12, 0.28, 3, 6), new THREE.MeshStandardMaterial({ color: 0x222222 }));
      body.rotation.z = Math.PI / 2; cat.add(body);
      var tail = S.mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.35, 4), new THREE.MeshStandardMaterial({ color: 0x222222 }));
      tail.position.set(-0.28, 0.12, 0); cat.add(tail);
      cat.position.y = 1.7; S.add(cat);
      return ret(function (t) { cat.position.x = Math.sin(t * 0.6) * 1.1; tail.rotation.z = Math.sin(t * 3) * 0.6; });
    }
    if (key === 'ciudad-respira') {
      S = stage(THREE, 0x0e1422);
      S.camera.position.set(8, 3, 8); S.camera.lookAt(0, 1.5, 0);
      S.add(new THREE.AmbientLight(0x223344, 0.6));
      buildings = [];
      [[-2, 2.2, 0x31405c], [0, 3.1, 0x3d4d68], [2.1, 1.7, 0x2a3548]].forEach(function (b) {
        var meshB = S.mesh(new THREE.BoxGeometry(1.2, b[1], 1.1), new THREE.MeshStandardMaterial({ color: b[2] }));
        meshB.position.set(b[0], b[1] / 2, 0); meshB.userData.h = b[1]; S.add(meshB); buildings.push(meshB);
      });
      return ret(function (t) {
        buildings.forEach(function (b, i) {
          var sc = 1 + Math.sin(t * 0.8 + i) * 0.03;
          b.scale.y = sc; b.position.y = b.userData.h / 2 * sc;
        });
      });
    }
    if (key === 'ciudad-alba') {
      S = stage(THREE, 0xf0b8c4);
      S.camera.position.set(5, 2.5, 7); S.camera.lookAt(0, 1, 0);
      S.add(new THREE.HemisphereLight(0xffd0dc, 0x8899aa, 0.95));
      var block = S.mesh(new THREE.BoxGeometry(1.4, 2, 1.2), new THREE.MeshStandardMaterial({ color: 0xf2d2c4 }));
      block.position.set(0, 1, 0); S.add(block);
      windows = [];
      for (var y = 0; y < 3; y++) {
        var wm = new THREE.MeshBasicMaterial({ color: 0xf6e7b0 });
        var ww = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), wm);
        ww.position.set(0, 0.45 + y * 0.5, 0.61); S.add(ww); windows.push(ww);
      }
      var sunA = S.mesh(new THREE.SphereGeometry(0.35, 12, 10), new THREE.MeshBasicMaterial({ color: 0xfff1c9 }));
      S.add(sunA);
      return ret(function (t) {
        sunA.position.set(-2 + t * 0.15, 0.4 + t * 0.12, -2);
        var mix = Math.min(1, t / 8);
        S.scene.background.setRGB(0.95 - mix * 0.2, 0.72 + mix * 0.1, 0.77 - mix * 0.2);
        windows.forEach(function (ww, i) { ww.material.color.set(i / 3 < mix ? 0xfff6dd : 0x88a); });
      });
    }
    if (key === 'barco-mesa') {
      S = stage(THREE, 0x3a2a22);
      S.camera.position.set(0, 2.2, 3.2); S.camera.lookAt(0, 0.4, 0);
      var lampL = new THREE.PointLight(0xffd27a, 1.3, 6); lampL.position.set(0, 2.2, 0.5); S.add(lampL);
      S.add(new THREE.AmbientLight(0x553322, 0.35));
      var table = S.mesh(new THREE.BoxGeometry(2.4, 0.12, 1.3), new THREE.MeshStandardMaterial({ color: 0x8a5a34 }));
      table.position.y = 0.3; S.add(table);
      var paper = S.mesh(new THREE.PlaneGeometry(0.7, 0.5), new THREE.MeshStandardMaterial({ color: 0xf7f4ea, side: THREE.DoubleSide }));
      paper.rotation.x = -Math.PI / 2; paper.position.y = 0.38; S.add(paper);
      var shade = S.mesh(new THREE.ConeGeometry(0.22, 0.28, 8), new THREE.MeshStandardMaterial({ color: 0xf1d48a }));
      shade.position.y = 1.7; S.add(shade);
      return ret(function (t) { paper.rotation.z = Math.sin(t * 0.8) * 0.2; lampL.intensity = 1.1 + Math.sin(t * 3) * 0.08; });
    }
    if (key === 'barco-charco') {
      S = stage(THREE, 0x9aa7b2);
      S.camera.position.set(3, 2.4, 4); S.camera.lookAt(0, 0.2, 0);
      S.add(new THREE.HemisphereLight(0xdde7ef, 0x667055, 0.9));
      var yard = S.mesh(new THREE.PlaneGeometry(8, 8), new THREE.MeshStandardMaterial({ color: 0x7d8a62 }));
      yard.rotation.x = -Math.PI / 2; S.add(yard);
      var puddle = S.mesh(new THREE.CircleGeometry(1.3, 20), new THREE.MeshStandardMaterial({ color: 0x6e93a8, metalness: 0.2, roughness: 0.15 }));
      puddle.rotation.x = -Math.PI / 2; puddle.position.y = 0.02; S.add(puddle);
      var step = S.mesh(new THREE.BoxGeometry(1.6, 0.25, 0.4), new THREE.MeshStandardMaterial({ color: 0xb9b1a4 }));
      step.position.set(-1.6, 0.15, 0.8); S.add(step);
      boat = S.mesh(new THREE.BoxGeometry(0.45, 0.08, 0.22), new THREE.MeshStandardMaterial({ color: 0xf4efe2 }));
      boat.position.set(-0.9, 0.12, 0.15); S.add(boat);
      return ret(function (t) { boat.rotation.y = Math.sin(t * 0.7) * 0.2; });
    }
    if (key === 'barco-zarpa') {
      S = stage(THREE, 0x7f96a6);
      S.camera.position.set(2.5, 1.8, 3.5); S.camera.lookAt(0, 0.2, 0);
      S.add(new THREE.AmbientLight(0xc5d4e0, 0.7));
      var waterZ = S.mesh(new THREE.CircleGeometry(1.8, 24), new THREE.MeshStandardMaterial({ color: 0x4f86a0, roughness: 0.2 }));
      waterZ.rotation.x = -Math.PI / 2; S.add(waterZ);
      boat = new THREE.Group();
      boat.add(S.mesh(new THREE.BoxGeometry(0.5, 0.1, 0.24), new THREE.MeshStandardMaterial({ color: 0xf7f1e1 })));
      var sail = S.mesh(new THREE.PlaneGeometry(0.22, 0.2), new THREE.MeshStandardMaterial({ color: 0xfffaf0, side: THREE.DoubleSide }));
      sail.position.y = 0.18; boat.add(sail); S.add(boat);
      return ret(function (t) { boat.position.set(Math.sin(t * 0.4) * 0.7, 0.08, Math.cos(t * 0.35) * 0.4); boat.rotation.y = t * 0.3; });
    }
    if (key === 'barco-lluvia') {
      S = stage(THREE, 0x4d6270); S.scene.fog = new THREE.Fog(0x6f8ea3, 5, 14);
      S.camera.position.set(2.4, 2, 3.6); S.camera.lookAt(0, 0.3, 0);
      S.add(new THREE.AmbientLight(0xb7c9d4, 0.6));
      var wp = S.mesh(new THREE.CircleGeometry(2, 20), new THREE.MeshStandardMaterial({ color: 0x3d6d84 }));
      wp.rotation.x = -Math.PI / 2; S.add(wp);
      boat = S.mesh(new THREE.BoxGeometry(0.5, 0.1, 0.24), new THREE.MeshStandardMaterial({ color: 0xf4efe2 }));
      boat.position.y = 0.1; S.add(boat);
      drops = [];
      var dmat = new THREE.MeshBasicMaterial({ color: 0xd6ecff });
      for (var d = 0; d < 28; d++) {
        var drop = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.12, 0.02), dmat);
        drop.userData.x = ((d * 17) % 30) / 10 - 1.5;
        drop.userData.z = ((d * 13) % 30) / 10 - 1.5;
        drop.userData.s = (d % 10) / 10;
        S.add(drop); drops.push(drop);
      }
      return ret(function (t) {
        boat.rotation.z = Math.sin(t * 2) * 0.12;
        drops.forEach(function (drop) { var u = (t * 0.9 + drop.userData.s) % 1; drop.position.set(drop.userData.x, 2.2 - u * 2.2, drop.userData.z); });
      });
    }
    if (key === 'barco-olas') {
      S = stage(THREE, 0x35586a);
      S.camera.position.set(3, 1.6, 3.2); S.camera.lookAt(0, 0.2, 0);
      var wl = new THREE.DirectionalLight(0xd0e4ee, 0.7); wl.position.set(1, 3, 2); S.add(wl);
      var wave = S.mesh(new THREE.PlaneGeometry(4, 4, 10, 10), new THREE.MeshStandardMaterial({ color: 0x2c6a86, wireframe: true }));
      wave.rotation.x = -Math.PI / 2; S.add(wave);
      boat = new THREE.Group();
      boat.add(S.mesh(new THREE.BoxGeometry(0.55, 0.12, 0.26), new THREE.MeshStandardMaterial({ color: 0xf7f1e1 })));
      var brick = S.mesh(new THREE.BoxGeometry(0.35, 0.12, 0.2), new THREE.MeshStandardMaterial({ color: 0xa33b32 }));
      brick.position.set(0.8, 0.02, 0.2); S.add(brick); S.add(boat);
      return ret(function (t) {
        var pos = wave.geometry.attributes.position;
        for (var i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 2 + t * 2) * 0.08 + Math.cos(pos.getY(i) * 2 + t) * 0.05);
        pos.needsUpdate = true;
        boat.position.y = 0.12 + Math.sin(t * 2.4) * 0.1;
        boat.rotation.z = Math.sin(t * 1.7) * 0.25;
        boat.position.x = Math.sin(t * 0.5) * 0.4;
      });
    }
    if (key === 'barco-orilla') {
      S = stage(THREE, 0xc5d5c0);
      S.camera.position.set(2.2, 1.8, 3.4); S.camera.lookAt(0, 0.3, 0);
      S.add(new THREE.HemisphereLight(0xfff6ea, 0x6a8f5a, 0.95));
      var grass = S.mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshStandardMaterial({ color: 0x7ea36a }));
      grass.rotation.x = -Math.PI / 2; S.add(grass);
      var calm = S.mesh(new THREE.CircleGeometry(1.1, 18), new THREE.MeshStandardMaterial({ color: 0x8fb4c4, roughness: 0.15 }));
      calm.rotation.x = -Math.PI / 2; calm.position.y = 0.02; S.add(calm);
      var flower = S.mesh(new THREE.SphereGeometry(0.12, 8, 8), new THREE.MeshStandardMaterial({ color: 0xe35d6a }));
      flower.position.set(1.1, 0.2, 0.4); S.add(flower);
      var stem = S.mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.25, 5), new THREE.MeshStandardMaterial({ color: 0x2f7d32 }));
      stem.position.set(1.1, 0.1, 0.4); S.add(stem);
      boat = S.mesh(new THREE.BoxGeometry(0.48, 0.1, 0.22), new THREE.MeshStandardMaterial({ color: 0xf7f3e8 }));
      boat.position.set(0.55, 0.1, 0.05); S.add(boat);
      return ret(function (t) { flower.position.y = 0.2 + Math.sin(t * 1.5) * 0.02; boat.rotation.y = Math.sin(t * 0.4) * 0.15; });
    }
    S = stage(THREE, 0x111111);
    S.camera.position.set(0, 1, 3);
    return ret(function () {});
  }
  function renderDoganieroTvApp(body) {
    body.innerHTML = '';
    if (!document.getElementById('dtv-style')) {
      var style = document.createElement('style');
      style.id = 'dtv-style';
      style.textContent = '#win-doganiero-tv .win-body{padding:0;overflow:hidden;display:flex;flex-direction:column;background:#070b14;color:#f4f7ff}.dtv{height:100%;min-height:0;display:flex;flex-direction:column}.dtv-top{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:10px 12px}.dtv-bal{font-weight:800}.dtv-days{opacity:.92}.dtv-msg{flex:1 1 160px;font-size:.86rem;color:#fecaca;min-height:1.2em}.dtv-btn,.dtv-ep,.dtv-pause{min-height:44px;border-radius:12px;border:1px solid rgba(255,255,255,.22);background:#16324a;color:#fff;padding:8px 12px;font-weight:700;cursor:pointer}.dtv-btn:disabled,.dtv-ep:disabled,.dtv-pause:disabled{opacity:.55;cursor:default;background:#16324a;color:#fff}.dtv-eps{display:flex;gap:8px;overflow:auto;padding:0 12px 8px}.dtv-ep{flex:0 0 auto;text-align:left;max-width:220px}.dtv-ep.on{outline:2px solid #7dd3fc}.dtv-stage{flex:1;min-height:0;display:flex;flex-direction:column}.dtv-story{padding:4px 12px 8px;max-height:34%;overflow:auto}.dtv-story h3{margin:0 0 4px;font-size:1rem}.dtv-part{margin:0 0 4px;font-size:.78rem;opacity:.8}.dtv-story p{margin:0;font-size:.9rem;line-height:1.35}.dtv-view{flex:1;min-height:160px;position:relative;background:#05070d}.dtv-view canvas{display:block;width:100%;height:100%}.dtv-pause{margin:8px 12px 12px;align-self:flex-start;width:auto}body.phone-mode .dtv-story{max-height:38%}body.phone-mode .dtv-story p{font-size:.84rem}body.phone-mode .dtv-top{padding:8px}';
      document.head.appendChild(style);
    }
    if (!document.getElementById('dtv-extra-css-20261009')) {
      var st2 = document.createElement('style');
      st2.id = 'dtv-extra-css-20261009';
      st2.textContent = [
        '.dtv-ep{position:relative;overflow:hidden;padding-bottom:12px}',
        '.dtv-ep-bar{position:absolute;left:8px;right:8px;bottom:5px;height:4px;border-radius:999px;background:rgba(255,255,255,.16);overflow:hidden}',
        '.dtv-ep-bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,#7dd3fc,#38bdf8);border-radius:999px}',
        '.dtv-ep-bar.done i{background:linear-gradient(90deg,#86efac,#22c55e)}',
        '.dtv-ep-tag{display:block;font-size:.68rem;font-weight:700;opacity:.8;margin-top:2px}',
        '.dtv-continue{display:flex;align-items:center;gap:10px;margin:0 12px 8px;padding:8px 12px;border-radius:12px;border:1px solid rgba(125,211,252,.45);background:linear-gradient(90deg,rgba(56,189,248,.18),rgba(22,50,74,.6));color:#fff;cursor:pointer;text-align:left;font-weight:700;min-height:44px;width:auto}',
        '.dtv-continue[hidden]{display:none!important}',
        '.dtv-continue small{display:block;font-weight:600;opacity:.8;font-size:.72rem}',
        '.dtv-prog{display:flex;gap:3px;margin:2px 0 6px}',
        '.dtv-prog span{flex:1;height:4px;border-radius:999px;background:rgba(255,255,255,.16);overflow:hidden}',
        '.dtv-prog span i{display:block;height:100%;width:0;background:#7dd3fc}',
        '.dtv-prog span.done i{width:100%}',
        '.dtv-view{position:relative}',
        '.dtv-sub{position:absolute;left:50%;bottom:12px;transform:translateX(-50%);max-width:92%;padding:6px 12px;border-radius:10px;background:rgba(0,0,0,.72);color:#fff;font-size:.95rem;line-height:1.35;text-align:center;pointer-events:none;z-index:2;text-shadow:0 1px 2px #000}',
        '.dtv-sub[hidden]{display:none!important}',
        'body.phone-mode .dtv-sub{font-size:.84rem;bottom:8px}',
        '.dtv-ctrls{display:flex;gap:8px;flex-wrap:wrap;margin:8px 12px 12px;align-items:center}',
        '.dtv-ctrls .dtv-pause{margin:0!important;width:auto!important}',
        '.dtv-pause[aria-pressed="true"]{background:#0e7490;border-color:#7dd3fc}',
        '.dtv-top .dtv-btn{width:auto!important;margin:0!important}',
        '.dtv-eps .dtv-ep{margin:0!important;width:auto!important}',
        '.dtv-continue{margin:0 12px 8px!important;width:auto!important;flex-direction:column;align-items:flex-start;gap:2px}',
        '.dtv-msg:empty{display:none}'
      ].join('\n');
      document.head.appendChild(st2);
    }
    var root = el('div', 'dtv');
    var top = el('div', 'dtv-top');
    var balEl = el('div', 'dtv-bal', 'Huesitos: …');
    var daysEl = el('div', 'dtv-days', '');
    var msgEl = el('div', 'dtv-msg', '');
    var payBtn = el('button', 'dtv-btn', 'Suscribirme · 5 huesitos al mes');
    payBtn.type = 'button';
    top.appendChild(balEl); top.appendChild(daysEl); top.appendChild(payBtn); top.appendChild(msgEl);
    var epsEl = el('div', 'dtv-eps');
    var stageEl = el('div', 'dtv-stage');
    var story = el('div', 'dtv-story');
    var storyTitle = el('h3', '', 'Elige un episodio');
    var storyPart = el('p', 'dtv-part', '');
    var storyText = el('p', '', 'Suscríbete con 5 huesitos para ver y escuchar Doganiero TV durante 30 días.');
    story.appendChild(storyTitle); story.appendChild(storyPart); story.appendChild(storyText);
    var view = el('div', 'dtv-view');
    var pauseBtn = el('button', 'dtv-pause', 'Pausa');
    pauseBtn.type = 'button';
    pauseBtn.disabled = true;
    var progEl = el('div', 'dtv-prog');
    story.insertBefore(progEl, storyText);
    var subEl = el('div', 'dtv-sub', '');
    subEl.hidden = true;
    subEl.setAttribute('aria-live', 'polite');
    view.appendChild(subEl);
    var restartBtn = el('button', 'dtv-pause', '⏮ Desde el inicio');
    restartBtn.type = 'button';
    restartBtn.disabled = true;
    var ccBtn = el('button', 'dtv-pause', 'CC Subtítulos');
    ccBtn.type = 'button';
    ccBtn.title = 'Mostrar u ocultar los subtítulos de la narración (tecla C)';
    var ctrls = el('div', 'dtv-ctrls');
    ctrls.appendChild(pauseBtn); ctrls.appendChild(restartBtn); ctrls.appendChild(ccBtn);
    stageEl.appendChild(story); stageEl.appendChild(view); stageEl.appendChild(ctrls);
    var contBtn = el('button', 'dtv-continue', '');
    contBtn.type = 'button';
    contBtn.hidden = true;
    root.appendChild(top); root.appendChild(contBtn); root.appendChild(epsEl); root.appendChild(stageEl);
    body.appendChild(root);

    var state = { huesitos: 0, subscribed: false, daysLeft: 0 };
    var alive = true, gen = 0, renderer = null, currentEp = null, partIndex = -1;
    var partStartElapsed = 0, sceneObj = null, elapsed = 0, lastTs = 0, raf = 0, loopOn = false;
    var userPaused = false, narrationPaused = false, episodeDone = false, speechBusy = false;
    var speechToken = 0, queue = [], queuePos = 0, activeId = '', keepAlive = 0;
    var win = body.closest ? body.closest('.app-window') : null;
    // ---- Continuar viendo + subtítulos (por perfil) ----
    function profKey(base) {
      var u = window.currentUser;
      return base + ':' + ((u && u.email) ? String(u.email).toLowerCase() : 'invitado');
    }
    function readJ(k, d) { try { var v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? d : v; } catch (e) { return d; } }
    function writeJ(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
    var RESUME_KEY = profKey('snakeos_tv_resume_v1');
    var CC_KEY = profKey('snakeos_tv_cc_v1');
    var ccOn = readJ(CC_KEY, true) !== false;
    function resumeMap() { var m = readJ(RESUME_KEY, {}); return (m && typeof m === 'object') ? m : {}; }
    function saveProgress(ep, i) {
      var m = resumeMap();
      var prev = m[ep.id] || {};
      m[ep.id] = { part: i, total: ep.parts.length, ts: Date.now(), done: !!prev.done };
      writeJ(RESUME_KEY, m);
    }
    function markDone(ep) {
      var m = resumeMap();
      m[ep.id] = { part: ep.parts.length, total: ep.parts.length, ts: Date.now(), done: true };
      writeJ(RESUME_KEY, m);
    }
    function resumePart(ep) {
      var r = resumeMap()[ep.id];
      if (!r || r.part >= ep.parts.length) return 0;
      return Math.max(0, Math.min(ep.parts.length - 1, Number(r.part) || 0));
    }
    function epFraction(ep) {
      var r = resumeMap()[ep.id];
      if (!r) return 0;
      if (r.part >= ep.parts.length || (r.done && !r.part)) return 1;
      return Math.max(0, Math.min(1, (Number(r.part) || 0) / ep.parts.length));
    }
    function paintEpButton(b, ep) {
      var f = epFraction(ep);
      var r = resumeMap()[ep.id];
      b.textContent = ep.title;
      var tag = el('span', 'dtv-ep-tag', '');
      if (r && (r.part >= ep.parts.length || (r.done && !r.part))) tag.textContent = '✓ Visto';
      else if (r && r.part > 0) tag.textContent = '⏯ Parte ' + (r.part + 1) + ' de ' + ep.parts.length;
      else tag.textContent = ep.parts.length + ' partes';
      b.appendChild(tag);
      var bar = el('span', 'dtv-ep-bar' + (f >= 1 ? ' done' : ''));
      var fill = document.createElement('i');
      fill.style.width = Math.round(f * 100) + '%';
      bar.appendChild(fill);
      b.appendChild(bar);
      b.title = f >= 1 ? 'Ya lo has visto · pulsa para verlo otra vez' : (f > 0 ? 'Continuar donde lo dejaste' : 'Ver episodio');
    }
    function lastInProgress() {
      var m = resumeMap(), best = null;
      EPISODES.forEach(function (ep) {
        var r = m[ep.id];
        if (r && r.part > 0 && r.part < ep.parts.length && (!best || r.ts > best.r.ts)) best = { ep: ep, r: r };
      });
      return best;
    }
    function paintContinue() {
      var b = lastInProgress();
      if (!b || !state.subscribed || (currentEp && currentEp.id === b.ep.id && !episodeDone)) { contBtn.hidden = true; return; }
      contBtn.hidden = false;
      contBtn.innerHTML = '';
      contBtn.appendChild(document.createTextNode('⏯ Continuar viendo: ' + b.ep.title));
      contBtn.appendChild(el('small', '', 'Parte ' + (b.r.part + 1) + ' de ' + b.ep.parts.length));
      contBtn.onclick = function () { play(b.ep); };
    }
    function paintProg() {
      progEl.innerHTML = '';
      if (!currentEp) return;
      currentEp.parts.forEach(function (p, i) {
        var s = el('span', i < partIndex || episodeDone ? 'done' : '');
        var f = document.createElement('i');
        if (i === partIndex && !episodeDone) f.setAttribute('data-cur', '1');
        s.appendChild(f);
        progEl.appendChild(s);
      });
    }
    function tickProg() {
      if (!currentEp || episodeDone || partIndex < 0) return;
      var f = progEl.querySelector('i[data-cur]');
      if (!f) return;
      var part = currentEp.parts[partIndex];
      var tPart = Math.max(1, Number(part.minMs) || 1);
      var ratio = Math.min(1, ((elapsed - partStartElapsed) * 1000) / tPart);
      if (speechBusy) ratio = Math.min(ratio, 0.95);
      f.style.width = Math.round(ratio * 100) + '%';
    }
    function setSub(t) {
      subEl.textContent = t || '';
      subEl.hidden = !ccOn || !t;
    }
    function paintCc() {
      ccBtn.setAttribute('aria-pressed', ccOn ? 'true' : 'false');
      ccBtn.textContent = ccOn ? 'CC Subtítulos: sí' : 'CC Subtítulos: no';
      if (!ccOn) subEl.hidden = true; else if (subEl.textContent) subEl.hidden = false;
    }
    try {
      if (window.speechSynthesis) {
        window.speechSynthesis.getVoices();
        window.speechSynthesis.addEventListener('voiceschanged', function () {
          try { window.speechSynthesis.getVoices(); } catch (e) {}
        });
      }
    } catch (eV) {}

    function daysLabel(n) {
      if (!state.subscribed) return 'Sin suscripción';
      if (n === 1) return 'Te queda 1 día';
      return 'Te quedan ' + n + ' días';
    }
    function paintStatus() {
      balEl.textContent = 'Huesitos: ' + state.huesitos;
      daysEl.textContent = daysLabel(state.daysLeft);
      payBtn.textContent = state.subscribed ? 'Renovar · 5 huesitos' : 'Suscribirme · 5 huesitos al mes';
      Array.prototype.forEach.call(epsEl.querySelectorAll('.dtv-ep'), function (btn) {
        btn.classList.toggle('on', btn.getAttribute('data-ep') === activeId);
        for (var k = 0; k < EPISODES.length; k++) if (EPISODES[k].id === btn.getAttribute('data-ep')) { paintEpButton(btn, EPISODES[k]); break; }
      });
      paintContinue();
    }
    function haltLoop() { loopOn = false; if (raf) cancelAnimationFrame(raf); raf = 0; lastTs = 0; }
    function disposeScene() { if (sceneObj && sceneObj.dispose) { try { sceneObj.dispose(); } catch (e) {} } sceneObj = null; }
    function disposeAll() {
      disposeScene();
      if (renderer) {
        try { renderer.dispose(); } catch (e2) {}
        if (renderer.domElement && renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
        renderer = null;
      }
    }
    function resize() {
      if (!renderer || !sceneObj) return;
      var w = view.clientWidth || 320, h = view.clientHeight || 180;
      if (w < 2 || h < 2) return;
      sceneObj.camera.aspect = w / h;
      sceneObj.camera.updateProjectionMatrix();
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(w, h, false);
      if (!loopOn) renderer.render(sceneObj.scene, sceneObj.camera);
    }
    function stopSpeech() {
      speechToken++; speechBusy = false; queue = []; queuePos = 0;
      try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (e) {}
    }
    var dtvSubTimer = 0;
    function pumpSpeech() {
      var token = speechToken;
      if (!alive || token !== speechToken || narrationPaused || userPaused || episodeDone) return;
      if (queuePos >= queue.length) { speechBusy = false; return; }
      var synth = window.speechSynthesis;
      if (!synth || typeof SpeechSynthesisUtterance === 'undefined') {
        // Sin voz: los subtítulos avanzan solos según la longitud del texto
        speechBusy = false;
        setSub(queue[queuePos]);
        if (dtvSubTimer) clearTimeout(dtvSubTimer);
        dtvSubTimer = setTimeout(function () {
          dtvSubTimer = 0;
          if (!alive || token !== speechToken || narrationPaused || userPaused || episodeDone) return;
          if (queuePos + 1 >= queue.length) return;
          queuePos++; pumpSpeech();
        }, Math.max(1800, String(queue[queuePos] || '').length * 60));
        return;
      }
      var u = new SpeechSynthesisUtterance(queue[queuePos]);
      setSub(queue[queuePos]);
      u.lang = 'es-ES'; u.rate = 1; u.volume = 1;
      try { var voice = pickSpanishVoice(); if (voice) u.voice = voice; } catch (e) {}
      u.onend = function () {
        if (!alive || token !== speechToken || narrationPaused || userPaused) return;
        queuePos++; pumpSpeech();
      };
      u.onerror = function (ev) {
        var code = ev && ev.error;
        if (code === 'canceled' || code === 'interrupted') return;
        if (!alive || token !== speechToken || narrationPaused || userPaused) return;
        queuePos++; pumpSpeech();
      };
      try { synth.resume(); synth.speak(u); synth.resume(); } catch (e2) { speechBusy = false; }
    }
    function beginPartSpeech(part, defer) {
      speechToken++;
      queue = splitChunks(part.text);
      queuePos = 0;
      speechBusy = queue.length > 0;
      setSub(queue[0] || '');
      var run = function () { if (!alive || narrationPaused || userPaused) return; pumpSpeech(); };
      if (defer) setTimeout(run, 80); else run();
    }
    function showPart(ep, i) {
      var part = ep.parts[i];
      storyTitle.textContent = ep.title;
      storyPart.textContent = 'Parte ' + (i + 1) + ' de ' + ep.parts.length;
      storyText.textContent = part.text;
      partStartElapsed = elapsed;
      episodeDone = false;
      pauseBtn.disabled = false;
      restartBtn.disabled = false;
      saveProgress(ep, i);
      paintProg();
      if (window.THREE) {
        disposeScene();
        sceneObj = buildScene(part.scene, window.THREE);
        if (!renderer) {
          renderer = new window.THREE.WebGLRenderer({ antialias: true, alpha: false });
          renderer.setClearColor(0x05070d, 1);
          view.appendChild(renderer.domElement);
        }
        resize();
      }
    }
    function startEpisode(ep, THREE, startAt) {
      window.THREE = THREE;
      startAt = Math.max(0, Math.min(ep.parts.length - 1, Number(startAt) || 0));
      currentEp = ep; partIndex = startAt; elapsed = 0;
      userPaused = false; narrationPaused = false; episodeDone = false;
      pauseBtn.textContent = 'Pausa';
      stopSpeech();
      showPart(ep, startAt);
      beginPartSpeech(ep.parts[startAt], true);
      armLoop();
      paintContinue();
    }
    function advancePart() {
      if (!currentEp || userPaused || narrationPaused) return;
      if (partIndex + 1 >= currentEp.parts.length) {
        episodeDone = true; speechBusy = false;
        storyPart.textContent = 'Fin del episodio';
        pauseBtn.disabled = true;
        setSub('');
        markDone(currentEp);
        paintProg();
        paintStatus();
        return;
      }
      partIndex++;
      showPart(currentEp, partIndex);
      beginPartSpeech(currentEp.parts[partIndex], false);
    }
    function tick(now) {
      if (!loopOn || !alive) return;
      raf = requestAnimationFrame(tick);
      if (userPaused || !sceneObj || !renderer) return;
      if (!lastTs) lastTs = now;
      var dt = Math.min(0.05, (now - lastTs) / 1000);
      lastTs = now; elapsed += dt;
      sceneObj.update(elapsed - partStartElapsed, elapsed);
      tickProg();
      renderer.render(sceneObj.scene, sceneObj.camera);
      if (!currentEp || episodeDone || partIndex < 0) return;
      var part = currentEp.parts[partIndex];
      if ((elapsed - partStartElapsed) * 1000 >= part.minMs && !speechBusy) advancePart();
    }
    function armLoop() {
      if (!alive || userPaused || !sceneObj || loopOn) return;
      if (win && (win.classList.contains('minimized') || win.classList.contains('win-closing'))) return;
      loopOn = true; lastTs = 0; raf = requestAnimationFrame(tick);
    }
    function pauseAll() {
      userPaused = true; narrationPaused = true; haltLoop();
      pauseBtn.textContent = 'Reanudar';
      var synth = window.speechSynthesis;
      if (synth) { try { synth.pause(); } catch (e) {} }
      setTimeout(function () {
        if (!alive || !narrationPaused) return;
        var s = window.speechSynthesis;
        if (!s) return;
        try { if (s.speaking && !s.paused) { speechToken++; s.cancel(); } } catch (e2) {}
      }, 120);
    }
    function resumeAll() {
      if (episodeDone || !currentEp) return;
      userPaused = false; narrationPaused = false;
      pauseBtn.textContent = 'Pausa';
      var synth = window.speechSynthesis;
      try { if (synth && synth.paused) { synth.resume(); armLoop(); return; } } catch (e) {}
      if (speechBusy || (!window.speechSynthesis && queuePos < queue.length)) pumpSpeech();
      armLoop();
    }
    keepAlive = setInterval(function () {
      if (!alive || narrationPaused || userPaused) return;
      var s = window.speechSynthesis;
      if (!s || !s.speaking || s.paused) return;
      try { s.resume(); } catch (e) {}
    }, 8000);
    function play(ep, fromStart) {
      if (!state.subscribed) { msgEl.textContent = 'Suscríbete con 5 huesitos para ver los episodios.'; return; }
      var startAt = fromStart ? 0 : resumePart(ep);
      var my = ++gen; activeId = ep.id; msgEl.textContent = ''; paintStatus();
      storyTitle.textContent = ep.title; storyPart.textContent = 'Cargando…';
      loadThree().then(function (THREE) {
        if (!alive || my !== gen) return;
        startEpisode(ep, THREE, startAt);
        if (startAt > 0) msgEl.textContent = 'Continuando en la parte ' + (startAt + 1) + ' de ' + ep.parts.length + ' · «⏮ Desde el inicio» para empezar de nuevo';
      }).catch(function () { if (alive && my === gen) msgEl.textContent = 'No se pudo cargar el visor 3D. Comprueba tu conexión y vuelve a intentarlo.'; });
    }
    EPISODES.forEach(function (ep) {
      var b = el('button', 'dtv-ep', ep.title);
      b.type = 'button'; b.setAttribute('data-ep', ep.id);
      paintEpButton(b, ep);
      b.addEventListener('click', function () { play(ep); });
      epsEl.appendChild(b);
    });
    function applyData(data) {
      state.huesitos = Number(data && data.huesitos) || 0;
      state.subscribed = !!(data && data.subscribed);
      state.daysLeft = Number(data && data.daysLeft) || 0;
      if (!state.subscribed) {
        activeId = ''; gen++; stopSpeech(); haltLoop(); disposeAll();
        pauseBtn.disabled = true; pauseBtn.textContent = 'Pausa';
        storyTitle.textContent = 'Elige un episodio'; storyPart.textContent = '';
        storyText.textContent = 'Suscríbete con 5 huesitos para ver y escuchar Doganiero TV durante 30 días. Cada episodio es una historia distinta.';
        currentEp = null; restartBtn.disabled = true; setSub(''); paintProg();
      } else if (!currentEp) {
        storyText.textContent = 'Elige un episodio para empezar. Cada episodio es una historia distinta, narrada en voz alta' + (ccOn ? ' y con subtítulos.' : '.');
      }
      paintStatus();
    }
    function refresh() {
      if (typeof window.api !== 'function') { msgEl.textContent = 'No se pudo leer la suscripción.'; return; }
      window.api('/api/doganiero-tv').then(applyData).catch(function (err) {
        if (!alive) return;
        msgEl.textContent = 'No se pudo leer la suscripción' + (err && err.message ? ' (' + err.message + ')' : '') + '. ';
        if (/…/.test(balEl.textContent)) balEl.textContent = 'Huesitos: —';
        var rb = document.createElement('button');
        rb.type = 'button';
        rb.className = 'dtv-retry';
        rb.textContent = '🔄 Reintentar';
        rb.style.cssText = 'width:auto;margin:0 0 0 6px;padding:3px 10px;border-radius:999px;font-size:.8em;cursor:pointer;display:inline-block;';
        rb.addEventListener('click', function () { msgEl.textContent = ''; balEl.textContent = 'Huesitos: …'; refresh(); });
        msgEl.appendChild(rb);
      });
    }
    payBtn.addEventListener('click', function () {
      msgEl.textContent = '';
      if (state.huesitos < 5) { msgEl.textContent = 'Necesitas 5 huesitos.'; return; }
      payBtn.disabled = true;
      window.api('/api/doganiero-tv/subscribe', { method: 'POST', body: {} }).then(function (data) {
        payBtn.disabled = false; applyData(data);
        msgEl.textContent = state.subscribed ? 'Suscripción activa. Elige un episodio.' : '';
      }).catch(function (err) {
        payBtn.disabled = false;
        msgEl.textContent = (err && err.message) || 'Necesitas 5 huesitos.';
        refresh();
      });
    });
    pauseBtn.addEventListener('click', function () {
      if (!currentEp || episodeDone) return;
      if (userPaused) resumeAll(); else pauseAll();
    });
    restartBtn.addEventListener('click', function () {
      if (!currentEp) return;
      play(currentEp, true);
    });
    ccBtn.addEventListener('click', function () {
      ccOn = !ccOn;
      writeJ(CC_KEY, ccOn);
      paintCc();
    });
    paintCc();
    pauseBtn.title = 'Pausa / continuar (tecla K o espacio)';
    // Atajos de teclado dentro de la ventana: K/espacio = pausa, C = subtítulos
    function dtvKeys(ev) {
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      var t = ev.target;
      var tag = t && t.tagName ? t.tagName.toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || (t && t.isContentEditable)) return;
      var k = String(ev.key || '').toLowerCase();
      if (k === 'k' || (k === ' ' && tag !== 'button')) {
        if (!currentEp || episodeDone) return;
        ev.preventDefault();
        pauseBtn.click();
      } else if (k === 'c') {
        ev.preventDefault();
        ccBtn.click();
      }
    }
    if (win) win.addEventListener('keydown', dtvKeys);
    window.addEventListener('resize', resize);
    var obs = null;
    if (win && window.MutationObserver) {
      obs = new MutationObserver(function () {
        var hidden = win.classList.contains('minimized') || win.classList.contains('win-closing');
        if (hidden) { if (currentEp && !episodeDone && !userPaused) pauseAll(); else haltLoop(); }
      });
      obs.observe(win, { attributes: true, attributeFilter: ['class'] });
    }
    refresh();
    return function cleanup() {
      alive = false; gen++; speechToken++; haltLoop();
      if (keepAlive) clearInterval(keepAlive);
      try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (e) {}
      disposeAll();
      window.removeEventListener('resize', resize);
      if (win) win.removeEventListener('keydown', dtvKeys);
      if (obs) obs.disconnect();
    };
  }
  window.renderDoganieroTvApp = renderDoganieroTvApp;
})();
