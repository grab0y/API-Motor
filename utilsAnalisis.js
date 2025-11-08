// services/analisisService.js

const cron = require('node-cron');
const Evento = require('./modelEventos'); // Asegúrate de importar tu modelo
const nodemailer = require('nodemailer'); // Usaremos esto para simular la alerta por email

// ==============================
// CONFIGURACIÓN DE ALERTAS
// ==============================
const ALERTA_REPETICION_VECES = 3;   // Máximo de veces que puede arrancar
const ALERTA_REPETICION_PERIODO_MIN = 120; // En las últimas 2 horas (120 minutos)
const ALERTA_FUNCIONAMIENTO_MAX_MIN = 30; // Máximo de 30 minutos encendido

// ==============================
// SIMULACIÓN DE ENVÍO DE ALERTA
// ==============================
const enviarAlerta = async (asunto, cuerpo) => {
    // ⚠️ NOTA: En un entorno de producción, aquí configurarías tu servicio de email (SendGrid, Mailgun, etc.)
    // O enviarías una notificación por Telegram/SMS.
    
    console.log('-------------------------------------------');
    console.log(`🚨 ¡ALERTA DISPARADA!`);
    console.log(`ASUNTO: ${asunto}`);
    console.log(`CUERPO: ${cuerpo}`);
    console.log('-------------------------------------------');
    
    // Si quieres un email real, descomenta y configura esto:
    /*
    let transporter = nodemailer.createTransport({
        service: 'gmail', // Ejemplo: o usa SMTP
        auth: {
            user: 'tu_email@gmail.com',
            pass: 'tu_password_app' 
        }
    });

    await transporter.sendMail({
        from: '"Monitor de Bomba" <monitor@bomba.com>',
        to: "tu_correo_de_alerta@dominio.com", 
        subject: asunto, 
        html: `<b>${cuerpo}</b>`, 
    });
    */
};

// ==============================
// FUNCIONES DE ANÁLISIS
// ==============================

// 1. ANÁLISIS DE ARRANQUES REPETITIVOS (Pérdida/Fuga)
const analizarArranquesRepetitivos = async (bombaId) => {
    const limiteTiempo = new Date(Date.now() - ALERTA_REPETICION_PERIODO_MIN * 60000);

    // 1. Buscar todos los eventos 'START' en el periodo
    const arranques = await Evento.find({
        id_bomba: bombaId,
        estado: 'START',
        timestamp: { $gte: limiteTiempo } // Desde hace 120 minutos hasta ahora
    }).sort({ timestamp: -1 });

    // 2. Aplicar la regla de alerta
    if (arranques.length >= ALERTA_REPETICION_VECES) {
        const asunto = `🚨 ALERTA: ${bombaId} - ${arranques.length} arranques en ${ALERTA_REPETICION_PERIODO_MIN} minutos.`;
        const cuerpo = `La bomba ${bombaId} ha arrancado ${arranques.length} veces. Esto puede indicar una posible fuga o un problema en el sistema de flotantes. El último arranque fue a las ${arranques[0].timestamp.toLocaleTimeString()}.`;
        await enviarAlerta(asunto, cuerpo);
    } else {
        console.log(`[Análisis Repetición] OK. Solo ${arranques.length} arranques en el periodo.`);
    }
};


// 2. ANÁLISIS DE FUNCIONAMIENTO PROLONGADO (Obstrucción/Fallo de Flotante)
const analizarFuncionamientoProlongado = async (bombaId) => {
    // 1. Buscar el último evento START
    const ultimoStart = await Evento.findOne({ 
        id_bomba: bombaId, 
        estado: 'START' 
    }).sort({ timestamp: -1 });

    if (!ultimoStart) {
        return; // No hay eventos de START para analizar
    }

    // 2. Buscar si hay un evento STOP posterior a ese START
    const stopPosterior = await Evento.findOne({
        id_bomba: bombaId,
        estado: 'STOP',
        timestamp: { $gt: ultimoStart.timestamp }
    }).sort({ timestamp: -1 });

    // Si no encontramos un STOP, la bomba sigue encendida.
    if (!stopPosterior) {
        const tiempoEncendidoMS = Date.now() - ultimoStart.timestamp.getTime();
        const tiempoEncendidoMin = Math.floor(tiempoEncendidoMS / 60000);

        // 3. Aplicar la regla de alerta
        if (tiempoEncendidoMin >= ALERTA_FUNCIONAMIENTO_MAX_MIN) {
            const asunto = `🚨 ALERTA: ${bombaId} - Encendida por ${tiempoEncendidoMin} minutos.`;
            const cuerpo = `La bomba ${bombaId} ha estado funcionando ininterrumpidamente desde las ${ultimoStart.timestamp.toLocaleTimeString()}. Esto excede el límite de ${ALERTA_FUNCIONAMIENTO_MAX_MIN} minutos. ¡Verificar!`;
            await enviarAlerta(asunto, cuerpo);
        } else {
            console.log(`[Análisis Prolongado] OK. Encendida por ${tiempoEncendidoMin} minutos.`);
        }
    } else {
        console.log('[Análisis Prolongado] OK. La bomba está apagada o tuvo un ciclo normal.');
    }
};

// ==============================
// CRON JOB PRINCIPAL
// ==============================

const iniciarAnalisis = (bombaId = "Bomba_Reservorio_01") => {
    // El cron job se ejecutará cada 10 minutos (*/10)
    // Puedes ajustarlo, por ejemplo:
    // '*/5 * * * *' -> cada 5 minutos
    // '0 * * * *' -> cada hora

    cron.schedule('*/1 * * * *', async () => {
        console.log(`\n--- Ejecutando análisis programado para ${bombaId} (${new Date().toLocaleTimeString()}) ---`);
        
        try {
            await analizarArranquesRepetitivos(bombaId);
            await analizarFuncionamientoProlongado(bombaId);
        } catch (error) {
            console.error('Error fatal durante el análisis de la bomba:', error);
        }
    }, {
        scheduled: true,
        timezone: "America/Argentina/Buenos_Aires" // Asegúrate de usar la zona horaria correcta
    });
    
    console.log('Programación de análisis de bomba iniciada (cada 10 minutos).');
};

module.exports = { iniciarAnalisis };