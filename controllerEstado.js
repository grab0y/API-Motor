// controllers/estadoController.js

const Evento = require('./modelEventos'); 
const ID_DE_TU_BOMBA = "Bomba_Reservorio_01"; // Usamos el mismo ID que en server.js

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