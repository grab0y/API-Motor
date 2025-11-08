// routes/authRoutes.js

const express = require('express');
const router = express.Router();
const authController = require('./controllerAuth');

// Ruta principal para iniciar sesión
router.post('/login', authController.login);

module.exports = router;