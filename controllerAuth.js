// controllers/authController.js

const jwt = require('jsonwebtoken');

// Credenciales fijas obtenidas de las variables de entorno
const USUARIO_VALIDO = process.env.JWT_USER;
const PASSWORD_VALIDA = process.env.JWT_PASS;
const JWT_SECRETO = process.env.JWT_SECRET;

exports.login = (req, res) => {
    const { username, password } = req.body;
    
    // --- NUEVA LÍNEA CLAVE: Convertir el nombre de usuario a minúsculas ---
    const lowerCaseUsername = username ? username.toLowerCase() : username;
    // ---------------------------------------------------------------------

    console.log(`[JWT] Intento de login para usuario: ${username} (validando como: ${lowerCaseUsername})`);

    // 1. Validar la existencia de credenciales
    // Se usa 'username' (el original) para la validación inicial de existencia
    if (!username || !password) {
        return res.status(400).json({ message: 'Se requiere nombre de usuario y contraseña.' });
    }

    // 2. Validar las credenciales fijas
    //console.log(`Comparando con credenciales válidas: ${USUARIO_VALIDO} ${PASSWORD_VALIDA}`);
    // Se usa 'lowerCaseUsername' para la comparación
    if (lowerCaseUsername === USUARIO_VALIDO && password === PASSWORD_VALIDA) {
        // 3. Credenciales correctas: Emitir el token JWT
        const payload = { 
            userId: 1, // ID simple para el usuario único
            // Es buena práctica usar el nombre de usuario normalizado (minúsculas)
            username: USUARIO_VALIDO 
        };
        
        // El token expira en 8 horas (8h). Puedes ajustar esto.
        const token = jwt.sign(payload, JWT_SECRETO, { expiresIn: '20h' }); 
        
        //console.log(`✅ [JWT] Login exitoso para ${lowerCaseUsername}.`);
        
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