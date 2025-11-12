// controllers/eventoController.js

// Asumiendo la ruta correcta:
const Evento = require('./modelEventos'); 

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