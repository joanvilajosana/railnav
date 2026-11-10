// Códigos de telefonema de la Consigna C 65/16 de ADIF (Libro de telefonemas), los que se
// intercambian el Responsable de Circulación y el maquinista. Redacción literal de la consigna
// (Joan, 10-11-2026); «___» son los huecos, (…) las opciones y […] lo opcional.
//
// tipo: lo que hace en la marcha ("ltv", "vista", "ilt", "ate", "com", "parada", "incidencia";
// "registro" = solo se anota). de: quién lo emite ("rc" o "maq").

export const CODIGOS = [
  // Del Responsable de Circulación al maquinista (3.1.1)
  { cod: "ABA", sit: "Anormalidad en baliza", tipo: "incidencia", de: "rc", f: "La baliza (ASFA, ERTMS, EBICAB, etc.), (previa, de señal, etc.) de la señal (clase) número ___, se encuentra (desplazada, fuera de servicio, etc.)." },
  { cod: "ARS5", sit: "Rebase de señal", tipo: "registro", de: "rc", f: "Autorizo al Maquinista (del tren ___, de la maniobra) a rebasar [la señal (clase) número ___] [la zona protegida para maniobras lado ___] de (estación, puesto, bifurcación, etc.) con (condiciones de circulación) [por la vía (I, II, etc.)]." },
  { cod: "ARS6", sit: "Rebase de señal", tipo: "registro", de: "rc", f: "Autorizo al Maquinista del tren ___ a rebasar desde la señal (avanzada, de entrada, de salida) número ___ de (estación) hasta la señal de (entrada, salida) número ___ de (estación) inclusive, sin exceder de 10 km/h al paso por las agujas, [después de verificar su posición] con (otras condiciones de circulación) [por la vía (I, II, etc.)]." },
  { cod: "ATE", sit: "Sobrepeso o impacto en vía", tipo: "ate", de: "rc", f: "No excederá la velocidad máxima de ___ km/h hasta (destino / primera estación abierta adecuada para el apartado)." },
  { cod: "BTA10", sit: "Bloqueo telefónico", tipo: "registro", de: "rc", f: "Circulará con BT entre ___ y ___ [por la vía (I, II, etc.)]. No funciona (BA, BLA, BEM). [Irá dispuesto a efectuar parada ante la/s aguja/s del/os km/s ___ y continuará la marcha después de verificar que está bien dispuesto el itinerario a seguir]." },
  { cod: "BTA15", sit: "Bloqueo telefónico", tipo: "registro", de: "rc", f: "Restablecido el (BA, BLA, BEM) entre ___ y ___ [por la vía (I, II, etc.)]." },
  { cod: "BTV14", sit: "Banalización temporal de vía", tipo: "registro", de: "rc", f: "Circulará a contravía entre ___ y ___. [Marche el tren ___ de vía ___.] [Irá dispuesto a efectuar parada ante la/s aguja/s del/os km/s ___ y continuará la marcha después de verificar que está bien dispuesto el itinerario a seguir]." },
  { cod: "BTV16", sit: "Banalización temporal de vía", tipo: "registro", de: "rc", f: "Circulará en sentido normal." },
  { cod: "CMT2", sit: "Cambio de modo de tracción", tipo: "registro", de: "rc", f: "(Realice, autorizado, denegado) cambio a modo de tracción (Eléctrico, Diesel) en tren nº ___ [Hasta (estación).]" },
  { cod: "EAC1", sit: "Estación de servicio intermitente", tipo: "registro", de: "rc", f: "La estación ___ se encuentra (cerrada, abierta) al servicio. [Queda autorizado para alterar el orden de las comprobaciones]." },
  { cod: "EAC14", sit: "Estación de servicio intermitente", tipo: "parada", de: "rc", f: "Se detendrá en (estación) y no reanudará la marcha hasta que lo ordene el Responsable de Circulación de la misma." },
  { cod: "ETC1", sit: "ETCS", tipo: "registro", de: "rc", f: "Autorizo al Maquinista de tren ___ para rebasar el EoA de (km, señal, pantalla ETCS, estación, puesto, bifurcación, etc.) con (condiciones de circulación)." },
  { cod: "ETC2", sit: "ETCS", tipo: "registro", de: "rc", f: "Autorizo al Maquinista de tren ___ a reanudar la marcha/retroceder con (condiciones de circulación) hasta ___." },
  { cod: "ETC3", sit: "ETCS", tipo: "registro", de: "rc", f: "Maquinista de tren ___ desconecte el ETCS y reanude marcha al amparo del BSL/BA/BLA con (condiciones de circulación)." },
  { cod: "ETC4", sit: "ETCS", tipo: "registro", de: "rc", f: "Maquinista de tren (seleccione el, continúe en) Nivel ___ [y reanude la marcha al amparo del BCA/BSL/BA/BLA] con (condiciones de circulación)." },
  { cod: "ETC5", sit: "ETCS", tipo: "registro", de: "rc", f: "Maquinista de tren ___, desconecte y vuelva a conectar el ETCS. Seleccione el Nivel («0+ASFA» o «0») y reanude la marcha al amparo del BSL/BA/BLA con (condiciones de circulación)." },
  { cod: "ETC6", sit: "ETCS", tipo: "registro", de: "rc", f: "Maquinista de tren ___, seleccione el Nivel (2, 1) y reanude la marcha al amparo del BCA/BSL/BA/BLA con (condiciones de circulación)." },
  { cod: "ILT5", sit: "Intervalo de liberación por tiempo", tipo: "ilt", de: "rc", f: "Circulará con marcha a la vista al paso por el km ___ [de la vía (I, II, etc.)] entre (estación inmediata anterior al km) y ___ por trabajos en intervalo de liberación por tiempo no restablecido." },
  { cod: "IVC3", sit: "Interrupción vía contigua", tipo: "registro", de: "rc", f: "Interrumpida la circulación por la/s vía/s (I, II, etc.) entre (estación) y (estación) para reconocer el tren." },
  { cod: "LTV3", sit: "Limitación temporal de velocidad", tipo: "ltv", de: "rc", f: "Establecida (o suprimida) limitación temporal de velocidad máxima a ___ km/h en vía/s ___ desde el km ___ al ___ entre ___ y ___ [por (motivo)]. Se encuentra señalizada (o sin señalizar). [Supone un CSV (si procede)]." },
  { cod: "LZB1", sit: "LZB", tipo: "registro", de: "rc", f: "Autorizo al Maquinista (del tren ___, de la maniobra) a rebasar la señal/pantalla [clase] número ___ de [(estación, puesto, bifurcación, etc.)] con (condiciones de circulación) [por la vía (I, II, etc.)]." },
  { cod: "LZB2", sit: "LZB", tipo: "registro", de: "rc", f: "Autorizo a Maquinista de tren ___ a continuar la marcha con (condiciones de circulación) hasta la señal (o pantalla) ___." },
  { cod: "LZB3", sit: "LZB", tipo: "registro", de: "rc", f: "Autorizo a Maquinista de tren ___ a continuar la marcha al amparo del BSL con «Marcha a la Vista» hasta la señal (siguiente señal de entrada o salida)." },
  { cod: "LZB4", sit: "LZB", tipo: "registro", de: "rc", f: "Maquinista de tren ___, desconecte (y vuelva a conectar) el LZB, y reanude la marcha al amparo del BSL con (condiciones de circulación)." },
  { cod: "LZB5", sit: "LZB", tipo: "registro", de: "rc", f: "Maquinista de tren ___, desconecte y vuelva a conectar el LZB, y reanude la marcha al amparo del BSL desde la señal ___ por vía (I, II)." },
  { cod: "MAV", sit: "Marcha a la vista", tipo: "vista", de: "rc", f: "Circulará con marcha a la vista entre ___ y ___ [sin exceder de ___ km/h] por (motivo)." },
  { cod: "MT1", sit: "Marche el tren", tipo: "registro", de: "rc", f: "Marche el tren ___ de vía ___." },
  { cod: "MT2", sit: "Marche el tren", tipo: "registro", de: "rc", f: "Marche el tren ___ hasta (estación inmediata) con marcha a la vista hasta la señal (primera de bloqueo)." },
  { cod: "PAN", sit: "Parada técnica no prescrita", tipo: "parada", de: "rc", f: "Efectuará parada en (estación, apeadero, punto kilométrico) para (motivo)." },
  { cod: "PN", sit: "Paso a nivel sin protección", tipo: "incidencia", de: "rc", f: "Paso a Nivel (estación, km) sin protección." },
  { cod: "REM", sit: "Reanudación de la marcha", tipo: "registro", de: "rc", f: "Puede reanudar la marcha a la estación de (estación) con (condiciones específicas de circulación)." },
  { cod: "RET2", sit: "Retroceso de tren", tipo: "registro", de: "rc", f: "Retroceda el tren ___ hasta (estación) [Con (condiciones de circulación)]." },
  { cod: "SAP", sit: "Señal apagada", tipo: "incidencia", de: "rc", f: "La señal (clase, número, localización) se encuentra apagada." },
  { cod: "SOC4", sit: "Socorro a tren", tipo: "registro", de: "rc", f: "Socorro a tren ___ [a la segunda parte de tren ___] detenido en el km ___ [de la vía (I, II, etc.)] entre ___ y ___. Circulará sin exceder de 40 km/h desde (estación anterior) y además, desde el km (3 km antes del punto donde se encuentra la cabeza o cola del tren detenido) con marcha a la vista y con (instrucciones y otras condiciones de circulación)." },
  { cod: "SOC5", sit: "Socorro a tren", tipo: "registro", de: "rc", f: "Socorro a tren ___ detenido [en la vía (I, II, etc.)] entre ___ y ___. Circulará con marcha a la vista y sin exceder de 40 km/h hasta su localización y con (instrucciones y otras condiciones de circulación)." },
  { cod: "SOC10", sit: "Socorro a tren", tipo: "registro", de: "rc", f: "Puede reanudar la marcha o retroceder a la estación de ___. [Con (condiciones de circulación)]." },
  { cod: "SOC11", sit: "Socorro a tren", tipo: "registro", de: "rc", f: "Mantenga tren ___ detenido en el km ___ por (causas)." },
  // Del maquinista al Responsable de Circulación (3.2.1)
  { cod: "APA", sit: "Tren completo", tipo: "registro", de: "maq", f: "Tren ___ llegó completo y apartado en ___." },
  { cod: "CMT1", sit: "Cambio de modo de tracción", tipo: "registro", de: "maq", f: "Solicito autorización para realizar el cambio a modo de tracción (Eléctrico, Diesel) en tren nº ___." },
  { cod: "COM", sit: "Limitación por el material", tipo: "com", de: "maq", f: "Tren nº ___ no puede exceder la velocidad de/l (tipo o km/h) por (causas)." },
  { cod: "IVC1", sit: "Interrupción vía contigua", tipo: "registro", de: "maq", f: "Maquinista de tren ___ detenido en el km (situación de la cabeza del tren). Solicito interrupción de la circulación por la/s vía/s (I, II, etc.) entre (estación) y (estación) para reconocer el tren." },
  { cod: "IVC4", sit: "Interrupción vía contigua", tipo: "registro", de: "maq", f: "Reconocido tren ___, queda sin efecto la interrupción de la circulación solicitada mediante mi telefonema nº ___." },
  { cod: "NCV2", sit: "Tren que no cortocircuita la vía", tipo: "registro", de: "maq", f: "Tren ___ se encuentra en plena vía." },
  { cod: "RET1", sit: "Retroceso de tren", tipo: "registro", de: "maq", f: "Tren ___ detenido en el km ___ [de la vía (I, II, etc.)] entre ___ y ___. Solicito autorización de retroceso." },
  { cod: "RET3", sit: "Retroceso de tren", tipo: "registro", de: "maq", f: "Tren ___ detenido en el km ___ [de la vía (I, II, etc.)] entre ___ y ___. Anulo solicitud de retroceso y solicito autorización para reanudar la marcha." },
  { cod: "RET7", sit: "Retroceso de tren", tipo: "registro", de: "rc", f: "Tren ___, (autorizado, ordenado) a retroceder a ___ puede reanudar la marcha hacia la estación ___ con (condiciones de circulación)." },
  { cod: "SOC1", sit: "Socorro a tren", tipo: "registro", de: "maq", f: "Tren ___ detenido en el km (situación de la cabeza del tren) [de la vía (I, II, etc.)] entre ___ y ___ por (avería, accidente) solicito socorro." },
  { cod: "SOC6", sit: "Socorro a tren", tipo: "registro", de: "maq", f: "Anulo petición de socorro para tren ___ que hice por telefonema núm. ___. Solicito autorización para reanudar la marcha (o retroceder) a la estación de ___." },
];

export const POR_CODIGO = Object.fromEntries(CODIGOS.map((c) => [c.cod, c]));

/** Código de un telefonema (los guardados antes de la v0.28.0 no lo tienen). */
export function codigoDe(t) {
  if (t.codigo != null) return t.codigo;
  if (t.tipo === "ltv" || t.tipo === "suprime") return "LTV3";
  if (t.tipo === "vista") return "MAV";
  return "";
}

/** Tipo de la marcha para un código ("" = sin código: solo registro). */
export function tipoDe(cod, suprime = false) {
  const c = POR_CODIGO[cod];
  if (!c) return "registro";
  if (c.tipo === "ltv") return suprime ? "suprime" : "ltv";
  return c.tipo;
}

const hueco = (x) => (x == null || String(x).trim() === "" ? "___" : String(x).trim());
const kmTxt = (x) => hueco(x).replace(/^(PK|KM)\.?\s*/i, "");
/** Un extremo «entre ___ y ___»: la estación si se da; si no, el km. */
const extremo = (est, pk) => (est ? est : pk ? `el km ${kmTxt(pk)}` : "___");
/** Un punto «(estación, apeadero, punto kilométrico)»: el km si se da; si no, la estación. */
const punto = (t) => (t.pk_ini ? `el km ${kmTxt(t.pk_ini)}` : hueco(t.est_ini));

/**
 * Texto del telefonema con la redacción literal de la consigna, con los datos anotados (los que
 * faltan quedan como «___»). null en los que se escriben a mano (los de solo registro, ABA, SAP).
 */
export function textoLiteral(t, tren = "") {
  const cod = codigoDe(t);
  const via = hueco(t.via ? t.via.replace(/^v[ií]as?\s*/i, "") : "");
  switch (cod) {
    case "LTV3":
      if (t.tipo === "suprime")
        return `Suprimida limitación temporal de velocidad máxima a ${hueco(t.v)} km/h en vía/s ${via} desde el km ${kmTxt(t.pk_ini)} al ${kmTxt(t.pk_fin)} entre ${hueco(t.est_ini)} y ${hueco(t.est_fin)}.`;
      return (
        `Establecida limitación temporal de velocidad máxima a ${hueco(t.v)} km/h en vía/s ${via} desde el km ${kmTxt(t.pk_ini)} al ${kmTxt(t.pk_fin)} entre ${hueco(t.est_ini)} y ${hueco(t.est_fin)}` +
        `${t.causa ? ` por ${t.causa}` : ""}. Se encuentra ${t.senalizada === false ? "sin señalizar" : "señalizada"}.${t.csv ? " Supone un CSV." : ""}`
      );
    case "MAV":
      return `Circulará con marcha a la vista entre ${extremo(t.est_ini, t.pk_ini)} y ${extremo(t.est_fin, t.pk_fin)}${t.v ? ` sin exceder de ${t.v} km/h` : ""} por ${hueco(t.causa)}.`;
    case "ILT5":
      return `Circulará con marcha a la vista al paso por el km ${kmTxt(t.pk_ini)}${t.via ? ` de la vía ${via}` : ""} entre ${hueco(t.est_ini)} y ${hueco(t.est_fin)} por trabajos en intervalo de liberación por tiempo no restablecido.`;
    case "ATE":
      return `No excederá la velocidad máxima de ${hueco(t.v)} km/h hasta ${hueco(t.est_fin)}.`;
    case "COM":
      return `Tren nº ${hueco(tren)} no puede exceder la velocidad de ${hueco(t.v)} km/h por ${hueco(t.causa)}.`;
    case "PAN":
      return `Efectuará parada en ${punto(t)} para ${hueco(t.causa)}.`;
    case "EAC14":
      return `Se detendrá en ${hueco(t.est_ini)} y no reanudará la marcha hasta que lo ordene el Responsable de Circulación de la misma.`;
    case "PN":
      return `Paso a Nivel ${t.pk_ini ? `km ${kmTxt(t.pk_ini)}` : hueco(t.est_ini)} sin protección.`;
    default:
      return null;
  }
}
