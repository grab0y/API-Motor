// controllers/eventoController.js

// Asumiendo la ruta correcta:
const Evento = require('./modelEventos'); 
const Heartbeat = require('./modelHeartbeat');

/**
 * Función para registrar un evento START o STOP enviado por el Arduino.
 */
exports.registrarEvento = async (req, res) => {
  console.log('[RECIBIDO] Nuevo evento recibido desde Arduino:', req.body);
  
  const { id_bomba, estado, timestamp } = req.body;

  // 1. Validación de parámetros requeridos (id_bomba y estado)
  if (!id_bomba || !estado) {
    return res.status(400).json({ success: false, message: 'Faltan parámetros: id_bomba y estado son requeridos.' });
  }

  // 2. Validación de valor de estado (MOVIDA AL CONTROLADOR)
  const estadosValidos = ['START', 'STOP'];
  const estadoMayuscula = estado.toUpperCase(); // Convertimos a mayúsculas para ser más tolerantes

  if (!estadosValidos.includes(estadoMayuscula)) {
    return res.status(400).json({ 
        success: false, 
        message: `Valor de estado inválido: '${estado}'. Solo se permiten ${estadosValidos.join(' o ')}.` 
    });
  }

  try {
    const nuevoEvento = new Evento({
      id_bomba: id_bomba,
      estado: estadoMayuscula, // Usamos la versión en mayúsculas validada
      timestamp: timestamp ? new Date(timestamp) : new Date(), 
    });

    console.log(`[RECIBIDO OK] Intentando guardar evento: ${estadoMayuscula} para ${id_bomba}`); 
    
    await nuevoEvento.save(); 

    console.log(`[GUARDADO OK] Evento '${estadoMayuscula}' registrado con éxito.`);
    res.status(200).json({ success: true, message: 'Evento registrado' });

  } catch (error) {
    console.error('🚨 ERROR CRÍTICO al guardar evento:', error.message); 
    res.status(500).json({ success: false, message: 'Error interno al guardar evento' }); 
  }
};

// Función para registrar el pulso de vida
exports.recordHeartbeat = async (req, res) => {
    try {
        const { rssi , id_bomba } = req.body;
        
        console.log('[RECIBIDO] Heartbeat recibido:', req.body);

        // Validación básica
        if (typeof rssi !== 'number' || uptime > 0) {
            return res.status(400).json({ 
                message: 'RSSI es requerido y debe ser un número negativo.' 
            });
        }

        // Crear y guardar el nuevo documento Heartbeat
        const newHeartbeat = new Heartbeat({
            uptime: rssi,
            id_bomba: id_bomba,
            // Si incluyes deviceId, asegúrate de recibirlo en req.body
            // deviceId: req.body.deviceId
        });

        await newHeartbeat.save();

        // Respuesta al Arduino
        res.status(200).json({ 
            message: 'Heartbeat registrado con éxito', 
            status: 'OK' 
        });

    } catch (error) {
        console.error('Error al registrar Heartbeat:', error);
        res.status(500).json({ 
            message: 'Error interno del servidor al procesar el Heartbeat.' 
        });
    }
};