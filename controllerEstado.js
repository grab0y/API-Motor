// controllers/estadoController.js

const Evento = require('./modelEventos'); 
const ID_DE_TU_BOMBA = "1"; // Usamos el mismo ID que en server.js

// Función auxiliar para obtener el inicio del día hace N días (en hora local de la BD/servidor)
const getStartOfDayXDaysAgo = (days) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0); // Establecer al inicio del día de hoy
    d.setDate(d.getDate() - days); // Retroceder N días
    return d;
};

// Lógica para obtener el último evento y determinar el estado.
exports.obtenerEstadoActual = async (req, res) => {
    try {
        // Buscar el último evento registrado para esta bomba, ordenado por timestamp descendente
        const ultimoEvento = await Evento.findOne({ id_bomba: ID_DE_TU_BOMBA })
                                          .sort({ timestamp: -1 }); // El más reciente

        let estadoActual = {
            encendida: false,
            ultimoCambio: null,
            mensaje: 'Bomba sin eventos registrados.'
        };

        if (ultimoEvento) {
            estadoActual.encendida = (ultimoEvento.estado === 'START');
            estadoActual.ultimoCambio = ultimoEvento.timestamp;
            estadoActual.mensaje = estadoActual.encendida ? 'FUNCIONANDO' : 'APAGADA';
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
                // 2. Agrupar por fecha (formateando la fecha para agrupar solo por día, mes y año)
                $group: {
                    _id: {
                        day: { $dayOfMonth: "$timestamp" },
                        month: { $month: "$timestamp" },
                        year: { $year: "$timestamp" }
                    },
                    conteo: { $sum: 1 } // Contar los eventos
                }
            },
            {
                // 3. Proyectar el resultado para un formato más limpio
                $project: {
                    _id: 0,
                    fecha: {
                        $dateFromParts: { 
                            year: "$_id.year", 
                            month: "$_id.month", 
                            day: "$_id.day" 
                        }
                    },
                    conteo: 1
                }
            },
            {
                // 4. Ordenar por fecha
                $sort: { fecha: 1 }
            }
        ]);

        // Generamos un mapa para rellenar los 7 días con 0 si no hay datos.
        const conteoCompleto = new Map();
        for (let i = 0; i < 7; i++) {
            const d = getStartOfDayXDaysAgo(6 - i); // Empezamos desde hace 6 días hasta hoy
            const key = d.toDateString(); 
            conteoCompleto.set(key, 0);
        }

        // Rellenar con los resultados reales de la BD
        resultados.forEach(item => {
            const key = new Date(item.fecha).toDateString();
            conteoCompleto.set(key, item.conteo);
        });

        // Convertir a formato de array [ { fecha: '...', conteo: X }, ... ]
        const datosFinales = Array.from(conteoCompleto).map(([dateString, conteo]) => ({
            fecha: new Date(dateString).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' }),
            conteo: conteo
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

        // Objeto para almacenar la duración total por día (DateString -> minutos)
        const duracionDiaria = new Map();
        for (let i = 0; i < 7; i++) {
            const d = getStartOfDayXDaysAgo(6 - i); // Empezamos desde hace 6 días hasta hoy
            duracionDiaria.set(d.toDateString(), 0);
        }

        let startTimestamp = null;
        let lastDayKey = null;

        // 2. Iterar sobre los eventos para emparejar START y STOP
        for (let i = 0; i < eventos.length; i++) {
            const evento = eventos[i];
            const eventoTimestamp = evento.timestamp.getTime(); // Tiempo en ms
            const currentDayKey = new Date(evento.timestamp).toDateString();

            if (evento.estado === 'START') {
                startTimestamp = eventoTimestamp;
                lastDayKey = currentDayKey; // Guardamos el día de inicio
            } else if (evento.estado === 'STOP' && startTimestamp !== null) {
                
                const stopTimestamp = eventoTimestamp;
                let duracionMS = stopTimestamp - startTimestamp;
                
                // 3. Manejar ciclos que cruzan la medianoche
                if (currentDayKey !== lastDayKey) {
                    // El ciclo empezó ayer y terminó hoy. Dividir la duración.
                    // a) Duración de ayer (desde START hasta medianoche de ayer)
                    const medianoche = getStartOfDayXDaysAgo(0); // Medianoche de hoy
                    
                    if (startTimestamp < medianoche.getTime()) {
                        const duracionAyerMS = medianoche.getTime() - startTimestamp;
                        const minutosAyer = Math.round(duracionAyerMS / 60000);
                        duracionDiaria.set(lastDayKey, (duracionDiaria.get(lastDayKey) || 0) + minutosAyer);
                        
                        // b) Duración de hoy (desde medianoche hasta STOP)
                        const duracionHoyMS = stopTimestamp - medianoche.getTime();
                        const minutosHoy = Math.round(duracionHoyMS / 60000);
                        duracionDiaria.set(currentDayKey, (duracionDiaria.get(currentDayKey) || 0) + minutosHoy);
                    } else {
                         // Si el ciclo es normal y no cruza, o cruzó pero el START fue el mismo día (teóricamente no debería pasar aquí)
                         const minutos = Math.round(duracionMS / 60000);
                         duracionDiaria.set(currentDayKey, (duracionDiaria.get(currentDayKey) || 0) + minutos);
                    }

                } else {
                    // Ciclo normal dentro del mismo día
                    const minutos = Math.round(duracionMS / 60000);
                    duracionDiaria.set(currentDayKey, (duracionDiaria.get(currentDayKey) || 0) + minutos);
                }

                startTimestamp = null; // Reiniciar para el próximo ciclo
                lastDayKey = null;
            }
        }

        // 4. Manejar el estado actual (si la bomba está encendida ahora)
        if (startTimestamp !== null) {
            const duracionActualMS = Date.now() - startTimestamp;
            const minutosActual = Math.round(duracionActualMS / 60000);
            
            // Asignamos la duración no cerrada al día actual
            const hoyKey = getStartOfDayXDaysAgo(0).toDateString();
            duracionDiaria.set(hoyKey, (duracionDiaria.get(hoyKey) || 0) + minutosActual);
        }

        // 5. Formatear la salida
        const datosFinales = Array.from(duracionDiaria).map(([dateString, minutos]) => ({
            fecha: new Date(dateString).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' }),
            minutos: minutos
        }));

        res.status(200).json({ success: true, datos: datosFinales });

    } catch (error) {
        console.error('Error al obtener tiempo encendido diario:', error);
        res.status(500).json({ success: false, message: 'Error interno al consultar el tiempo encendido.' });
    }
};

// Rutas para forzar el análisis de alertas (llamadas desde el frontend/postman)
exports.forzarAnalisis = async (req, res) => {
    // Asumimos que ID_DE_TU_BOMBA está disponible en este scope.
    const { analizarAlertas } = require('../utilsAnalisis');
    const resultado = await analizarAlertas(ID_DE_TU_BOMBA);
    
    if (resultado.success) {
        res.status(200).json(resultado);
    } else {
        res.status(500).json(resultado);
    }
};