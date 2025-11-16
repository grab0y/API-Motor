// models/Alerta.js

const mongoose = require('mongoose');

const AlertaSchema = new mongoose.Schema({
    bombaId: {
        type: String,
        required: true,
        trim: true
    },
    tipo: {
        type: String,
        required: true,
        enum: ['REPETICION', 'PROLONGADO']
    },
    descripcion: {
        type: String,
        required: true
    },
    detalle: {
        type: mongoose.Schema.Types.Mixed,
        default: null
    },
    activo: {
        type: Boolean,
        default: true
    },
    mensajeResolucion: {
        type: String,
        default: null
    },
    resueltaEn: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Alerta', AlertaSchema);
