// routes/estadoRoutes.js

const express = require('express');
const router = express.Router();
const estadoController = require('./controllerEstado');

// Ruta GET para obtener el estado actual de la bomba
router.get('/estado', estadoController.obtenerEstadoActual);

// Ruta GET para obtener el historial reciente
router.get('/historial/:limite', estadoController.obtenerHistorial);

module.exports = router;