// routes/eventoRoutes.js

const express = require('express');
const router = express.Router();
const eventoController = require('./controllerEventos');

// El Arduino hará un POST a esta ruta: /api/bomba/evento
// Ejemplo de Body: { "id_bomba": "BombaPrincipal", "estado": "START" }
router.post('/evento', eventoController.registrarEvento);

module.exports = router;