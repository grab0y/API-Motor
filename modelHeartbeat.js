// models/Heartbeat.js
const mongoose = require('mongoose');

const heartbeatSchema = new mongoose.Schema({
      id_bomba: {
    type: String,
    required: true,
    trim: true,
  },
    // Uptime reportado por el Arduino (en segundos, milisegundos, o como lo envíe)
    uptime: {
        type: Number,
        required: true
    },
    // Marca de tiempo de cuando se recibió el pulso
    receivedAt: {
        type: Date,
        default: Date.now
    }
    // Puedes añadir un campo para identificar el dispositivo si tienes varios
    /* deviceId: {
        type: String,
        required: true
    }
    */
});

const Heartbeat = mongoose.model('Heartbeat', heartbeatSchema);

module.exports = Heartbeat;