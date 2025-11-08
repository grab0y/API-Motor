// controllers/authController.js

const jwt = require('jsonwebtoken');

// Credenciales fijas obtenidas de las variables de entorno
const USUARIO_VALIDO = process.env.JWT_USER;
const PASSWORD_VALIDA = process.env.JWT_PASS;
const JWT_SECRETO = process.env.JWT_SECRET;

exports.login = (req, res) => {
    const { username, password } = req.body;
    console.log(`[JWT] Intento de login para usuario: ${username} ${password}`);

    // 1. Validar la existencia de credenciales
    if (!username || !password) {
        return res.status(400).json({ message: 'Se requiere nombre de usuario y contraseña.' });
    }

    // 2. Validar las credenciales fijas
    console.log(`Comparando con credenciales válidas: ${USUARIO_VALIDO} ${PASSWORD_VALIDA}`);
    if (username === USUARIO_VALIDO && password === PASSWORD_VALIDA) {
        // 3. Credenciales correctas: Emitir el token JWT
        const payload = { 
            userId: 1, // ID simple para el usuario único
            username: USUARIO_VALIDO 
        };
        
        // El token expira en 8 horas (8h). Puedes ajustar esto.
        const token = jwt.sign(payload, JWT_SECRETO, { expiresIn: '8h' }); 
        
        console.log(`✅ [JWT] Login exitoso para ${username}.`);
        
        // Devolver el token al cliente
        return res.status(200).json({ 
            success: true, 
            message: 'Login exitoso', 
            token: token 
        });

    } else {
        // 4. Credenciales incorrectas
        console.warn(`❌ [JWT] Intento de login fallido para ${username}.`);
        return res.status(401).json({ message: 'Credenciales inválidas.' });
    }
};