// models/Evento.js

const mongoose = require('mongoose');

const EventoSchema = new mongoose.Schema({
  // Identificador de la bomba (útil si manejas varias)
  id_bomba: {
    type: String,
    required: true,
    trim: true,
  },
  // 'START' o 'STOP'
  estado: {
    type: String,
    required: true,
    enum: ['START', 'STOP'], // Solo permite estos dos valores
  },
  // El momento en que ocurrió el evento (CRUCIAL para los cálculos)
  timestamp: {
    type: Date,
    default: Date.now, // Por defecto, usa la hora del servidor si el Arduino no la envía
  },
  // Opcional: para el análisis futuro (duración, alertas, etc.)
  procesado: {
    type: Boolean,
    default: false,
  },
  duracion_ms: {
    type: Number, // Para guardar el tiempo de funcionamiento en milisegundos
    default: null,
  }
}, { 
    // Agrega un índice para poder ordenar y buscar rápidamente por fecha y bomba
    timestamps: true 
});

module.exports = mongoose.model('Evento', EventoSchema);