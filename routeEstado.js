// routes/estadoRoutes.js

const express = require('express');
const router = express.Router();
const estadoController = require('./controllerEstado');

// Ruta GET para obtener el estado actual de la bomba
router.get('/estado', estadoController.obtenerEstadoActual);

// Ruta GET para obtener el historial reciente
router.get('/historial/:limite', estadoController.obtenerHistorial);

// Ruta GET para obtener el conteo de arranques por día
router.get('/conteo-diario', estadoController.obtenerConteoDiario);

// 💡 NUEVO: Ruta GET para obtener los minutos encendidos por día
router.get('/tiempo-encendido-diario', estadoController.obtenerTiempoEncendidoDiario);

module.exports = router;