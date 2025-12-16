// controllers/estadoController.js

const Evento = require('./modelEventos'); 
const Alerta = require('./modelAlertas');
const ID_DE_TU_BOMBA = "1"; // Usamos el mismo ID que en server.js
const LOCAL_TIMEZONE = 'America/Argentina/Buenos_Aires';
const LOCAL_TZ_ISO_OFFSET = '-03:00'; // Buenos Aires opera en UTC-3 sin DST

// Reutilizamos formatters para evitar recrearlos en cada iteración.
const localKeyFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: LOCAL_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
});

const localLabelFormatter = new Intl.DateTimeFormat('es-AR', {
    timeZone: LOCAL_TIMEZONE,
    day: '2-digit',
    month: 'short'
});

const formatLocalDateKey = (date) => localKeyFormatter.format(date);
const formatLocalDateLabel = (date) => localLabelFormatter.format(date);
const formatLabelFromKey = (key) => formatLocalDateLabel(new Date(`${key}T00:00:00${LOCAL_TZ_ISO_OFFSET}`));
const formatLocalDateTime = (date) => date
    ? new Date(date).toLocaleString('es-AR', {
        timeZone: LOCAL_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    })
    : null;

const getLocalDayStart = (date) => new Date(`${formatLocalDateKey(date)}T00:00:00${LOCAL_TZ_ISO_OFFSET}`);
const getLocalDayEnd = (date) => new Date(getLocalDayStart(date).getTime() + 24 * 60 * 60 * 1000);

// Función auxiliar para obtener el inicio del día hace N días (en hora local).
const getStartOfDayXDaysAgo = (days) => {
    const d = new Date();
    d.setDate(d.getDate() - days); // Retroceder N días
    return getLocalDayStart(d);
};

const sumarDuracionPorDia = (inicio, fin, acumulador) => {
    if (!inicio || !fin || inicio >= fin) return;

    let cursor = new Date(inicio);
    const limite = new Date(fin);

    while (cursor < limite) {
        const key = formatLocalDateKey(cursor);
        const finDia = getLocalDayEnd(cursor);
        const segmentoFin = finDia < limite ? finDia : limite;
        const diffMs = segmentoFin.getTime() - cursor.getTime();

        if (!acumulador.has(key)) {
            acumulador.set(key, { ms: 0, label: formatLabelFromKey(key) });
        }

        const acumulado = acumulador.get(key);
        acumulado.ms += diffMs;

        cursor = new Date(segmentoFin);
    }
};

// Lógica para obtener el último evento, estado y AHORA el último RSSI.
exports.obtenerEstadoActual = async (req, res) => {
    try {
        // [1] Buscar el último evento (para estado ON/OFF)
        const ultimoEvento = await Evento.findOne({ id_bomba: ID_DE_TU_BOMBA })
                                          .sort({ timestamp: -1 });

        // [2] Buscar el último Heartbeat (para RSSI)
        const ultimoHeartbeat = await Heartbeat.findOne({ id_bomba: ID_DE_TU_BOMBA })
                                              .sort({ receivedAt: -1 })
                                              .select('rssi receivedAt'); // Solo necesitamos RSSI y el tiempo

        let estadoActual = {
            encendida: false,
            ultimoCambio: null,
            mensaje: 'Bomba sin eventos registrados.',
            // --- NUEVOS CAMPOS ---
            rssi: null, 
            ultimaConexion: null
            // ---------------------
        };

        if (ultimoEvento) {
            estadoActual.encendida = (ultimoEvento.estado === 'START');
            estadoActual.ultimoCambio = formatLocalDateTime(ultimoEvento.timestamp);
            estadoActual.mensaje = estadoActual.encendida ? 'FUNCIONANDO' : 'APAGADA';
        }

        if (ultimoHeartbeat && ultimoHeartbeat.rssi !== undefined) {
            estadoActual.rssi = ultimoHeartbeat.rssi;
            estadoActual.ultimaConexion = formatLocalDateTime(ultimoHeartbeat.receivedAt);
        }
        
        // Si no hay eventos, pero sí hay heartbeat, ajustamos el mensaje
        if (!ultimoEvento && ultimoHeartbeat) {
             estadoActual.mensaje = 'Bomba en línea, esperando primer evento.';
        }

        res.status(200).json(estadoActual);
    } catch (error) {
        console.error('Error al obtener estado actual:', error);
        res.status(500).json({ success: false, message: 'Error interno al consultar el estado.' });
    }
};

// Lógica para obtener los últimos N eventos.
exports.obtenerHistorial = async (req, res) => {
    const limite = parseInt(req.params.limite) || 10; // Por defecto 10, o el límite pasado en la URL

    try {
        // Buscar los N eventos más recientes
        const historial = await Evento.find({ id_bomba: ID_DE_TU_BOMBA })
                                      .sort({ timestamp: -1 })
                                      .limit(limite);
        
        res.status(200).json({ success: true, historial });
    } catch (error) {
        console.error('Error al obtener historial:', error);
        res.status(500).json({ success: false, message: 'Error interno al consultar el historial.' });
    }
};

// Lógica para obtener el conteo de arranques por día en los últimos 7 días.
exports.obtenerConteoDiario = async (req, res) => {
    try {
        const haceSieteDias = getStartOfDayXDaysAgo(7);

        // Pipeline de agregación de MongoDB para contar por día
        const resultados = await Evento.aggregate([
            {
                // 1. Filtrar eventos START en los últimos 7 días
                $match: {
                    id_bomba: ID_DE_TU_BOMBA,
                    estado: 'START',
                    timestamp: { $gte: haceSieteDias }
                }
            },
            {
                // 2. Agrupar aplicando la zona horaria local para evitar desfases
                $group: {
                    _id: {
                        $dateToString: {
                            format: "%Y-%m-%d",
                            date: "$timestamp",
                            timezone: LOCAL_TIMEZONE
                        }
                    },
                    conteo: { $sum: 1 } // Contar los eventos
                }
            },
            {
                // 3. Proyectar el resultado para un formato más limpio
                $project: {
                    _id: 0,
                    fechaClave: "$_id",
                    conteo: 1
                }
            },
            {
                // 4. Ordenar por la fecha local calculada
                $sort: { fechaClave: 1 }
            }
        ]);

        // Generamos un mapa para rellenar los 7 días con 0 si no hay datos.
        const conteoCompleto = new Map();
        const hoy = new Date();
        for (let i = 0; i < 7; i++) {
            const baseDate = new Date(hoy);
            baseDate.setDate(baseDate.getDate() - (6 - i)); // Empezamos desde hace 6 días hasta hoy
            const key = formatLocalDateKey(baseDate);
            conteoCompleto.set(key, { conteo: 0, label: formatLocalDateLabel(baseDate) });
        }

        // Rellenar con los resultados reales de la BD
        resultados.forEach(item => {
            const existente = conteoCompleto.get(item.fechaClave);
            if (existente) {
                existente.conteo = item.conteo;
            } else {
                conteoCompleto.set(item.fechaClave, {
                    conteo: item.conteo,
                    label: formatLabelFromKey(item.fechaClave)
                });
            }
        });

        // Convertir a formato de array [ { fecha: '...', conteo: X }, ... ]
        const datosFinales = Array.from(conteoCompleto.entries())
            .sort(([fechaA], [fechaB]) => fechaA.localeCompare(fechaB))
            .map(([, { label, conteo }]) => ({
                fecha: label,
                conteo
            }));
        
        res.status(200).json({ success: true, datos: datosFinales });

    } catch (error) {
        console.error('Error al obtener conteo diario:', error);
        res.status(500).json({ success: false, message: 'Error interno al consultar el conteo diario.' });
    }
};

/**
 * Lógica NUEVA para obtener la cantidad de minutos encendida por día (últimos 7 días).
 */
exports.obtenerTiempoEncendidoDiario = async (req, res) => {
    try {
        const haceSieteDias = getStartOfDayXDaysAgo(7);

        // 1. Obtener todos los eventos START/STOP en los últimos 7 días
        const eventos = await Evento.find({
            id_bomba: ID_DE_TU_BOMBA,
            timestamp: { $gte: haceSieteDias }
        }).sort({ timestamp: 1 }); // Ordenamos cronológicamente

        // Objeto para almacenar la duración total por día (clave local -> acumulado en ms)
        const duracionDiaria = new Map();
        const hoy = new Date();
        for (let i = 0; i < 7; i++) {
            const baseDate = new Date(hoy);
            baseDate.setDate(baseDate.getDate() - (6 - i)); // Empezamos desde hace 6 días hasta hoy
            const key = formatLocalDateKey(baseDate);
            duracionDiaria.set(key, { ms: 0, label: formatLocalDateLabel(baseDate) });
        }

        let startTimestamp = null;

        // 2. Iterar sobre los eventos para emparejar START y STOP
        for (let i = 0; i < eventos.length; i++) {
            const evento = eventos[i];

            if (evento.estado === 'START') {
                startTimestamp = new Date(evento.timestamp);
            } else if (evento.estado === 'STOP' && startTimestamp !== null) {
                sumarDuracionPorDia(startTimestamp, new Date(evento.timestamp), duracionDiaria);
                startTimestamp = null; // Reiniciar para el próximo ciclo
            }
        }

        // 4. Manejar el estado actual (si la bomba está encendida ahora)
        if (startTimestamp !== null) {
            sumarDuracionPorDia(startTimestamp, new Date(), duracionDiaria);
        }

        // 5. Formatear la salida
        const datosFinales = Array.from(duracionDiaria.entries())
            .sort(([fechaA], [fechaB]) => fechaA.localeCompare(fechaB))
            .map(([, { label, ms }]) => ({
                fecha: label,
                minutos: Math.round(ms / 60000)
            }));

        res.status(200).json({ success: true, datos: datosFinales });

    } catch (error) {
        console.error('Error al obtener tiempo encendido diario:', error);
        res.status(500).json({ success: false, message: 'Error interno al consultar el tiempo encendido.' });
    }
};



/**
 * Devuelve las ultimas fallas registradas en la coleccion de alertas.
 * Permite filtrar por alertas activas/inactivas y limitar el resultado.
 */
exports.obtenerAlertasRecientes = async (req, res) => {
    const limiteSolicitado = parseInt(req.query.limite, 10) || 10;
    const limite = Math.max(1, Math.min(limiteSolicitado, 50));
    const filtro = { bombaId: ID_DE_TU_BOMBA };

    if (typeof req.query.activo !== 'undefined') {
        filtro.activo = req.query.activo === 'true';
    }

    try {
        const alertas = await Alerta.find(filtro)
            .sort({ createdAt: -1 })
            .limit(limite)
            .select('-__v');
        const alertasFormateadas = alertas.map((alerta) => {
            const plain = alerta.toObject();
            return {
                ...plain,
                createdAtLocal: formatLocalDateTime(plain.createdAt),
                resueltaEnLocal: formatLocalDateTime(plain.resueltaEn)
            };
        });

        res.status(200).json({ success: true, alertas: alertasFormateadas });
    } catch (error) {
        console.error('Error al obtener alertas recientes:', error);
        res.status(500).json({ success: false, message: 'Error interno al consultar las alertas.' });
    }
};

