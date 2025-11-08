// services/analisisService.js

const cron = require('node-cron');
const Evento = require('./modelEventos'); // Asegúrate de que esta ruta sea correcta
const nodemailer = require('nodemailer'); // Para simular el envío de alertas

// ==============================
// CONFIGURACIÓN DE ALERTAS Y SILENCIAMIENTO
// ==============================
const ALERTA_REPETICION_VECES = 3;   // Máximo de veces que puede arrancar
const ALERTA_REPETICION_PERIODO_MIN = 120; // Período de 2 horas
const ALERTA_FUNCIONAMIENTO_MAX_MIN = 30; // Máximo de 30 minutos encendido

// 🚨 VARIABLES GLOBALES EN MEMORIA para el silenciamiento
// Estas variables persisten mientras el servidor Node.js esté activo.
let alertaActivaRepeticion = false;
let alertaActivaProlongado = false;

// ==============================
// SIMULACIÓN DE ENVÍO DE ALERTA
// ==============================
const enviarAlerta = async (asunto, cuerpo) => {
    // Aquí iría el código real de envío de email o notificación.
    console.log('-------------------------------------------');
    console.log(`🚨 ¡ALERTA DISPARADA!`);
    console.log(`ASUNTO: ${asunto}`);
    console.log(`CUERPO: ${cuerpo}`);
    console.log('-------------------------------------------');
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
        timestamp: { $gte: limiteTiempo }
    }).sort({ timestamp: -1 });

    // 2. Aplicar la regla de alerta
    if (arranques.length >= ALERTA_REPETICION_VECES) {
        // --- 🚨 Falla detectada ---
        if (!alertaActivaRepeticion) {
            // Solo alertar si la falla no estaba previamente activa
            const asunto = `🚨 ALERTA INICIO: ${bombaId} - ${arranques.length} arranques en ${ALERTA_REPETICION_PERIODO_MIN} minutos.`;
            const cuerpo = `La bomba ${bombaId} ha arrancado ${arranques.length} veces. Fuga o flotante defectuoso.`;
            await enviarAlerta(asunto, cuerpo);
            alertaActivaRepeticion = true; // Activar el modo silencio
            console.log(`[Análisis Repetición] FALLA DETECTADA. Alerta enviada.`);
        } else {
            // Ya alertamos, solo registramos en consola (silencio)
            console.log(`[Análisis Repetición] FALLA ACTIVA. Silenciamiento.`);
        }
    } else {
        // --- ✅ Falla resuelta ---
        if (alertaActivaRepeticion) {
            // Si la falla estaba activa pero ya no se cumple, notificar resolución (opcional)
            console.log(`[Análisis Repetición] RESOLUCIÓN. La bomba ha vuelto a ciclos normales.`);
            alertaActivaRepeticion = false; // Desactivar el modo silencio
        } else {
            console.log(`[Análisis Repetición] OK. Ciclos normales.`);
        }
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
        // No hay eventos de START, no hay falla
        if (alertaActivaProlongado) {
            // Si estaba activa, y no hay START, se asume que se resolvió
            console.log(`[Análisis Prolongado] RESOLUCIÓN. Bomba sin START reciente.`);
            alertaActivaProlongado = false;
        }
        return; 
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
            // --- 🚨 Falla detectada ---
            if (!alertaActivaProlongado) {
                // Solo alertar si la falla no estaba previamente activa
                const asunto = `🚨 ALERTA INICIO: ${bombaId} - Encendida por ${tiempoEncendidoMin} minutos.`;
                const cuerpo = `La bomba ${bombaId} excede el límite de ${ALERTA_FUNCIONAMIENTO_MAX_MIN} minutos. Posible obstrucción o fallo de flotante.`;
                await enviarAlerta(asunto, cuerpo);
                alertaActivaProlongado = true; // Activar el modo silencio
                console.log(`[Análisis Prolongado] FALLA DETECTADA. Alerta enviada.`);
            } else {
                // Ya alertamos, en silencio
                console.log(`[Análisis Prolongado] FALLA ACTIVA (${tiempoEncendidoMin} min). Silenciamiento.`);
            }
        } else {
            // El tiempo encendido es alto, pero aún bajo el umbral de alerta
            console.log(`[Análisis Prolongado] OK. Encendida por ${tiempoEncendidoMin} minutos.`);
        }
    } else {
        // --- ✅ Falla resuelta ---
        if (alertaActivaProlongado) {
            // Si la bomba estaba en alerta y se acaba de apagar (hay un STOP posterior), notificar resolución
            console.log(`[Análisis Prolongado] RESOLUCIÓN. La bomba se ha apagado después de la alerta.`);
            alertaActivaProlongado = false; // Desactivar el modo silencio
        }
        console.log('[Análisis Prolongado] OK. La bomba está apagada o tuvo un ciclo normal.');
    }
};


// ==============================
// CRON JOB PRINCIPAL
// ==============================

const iniciarAnalisis = (bombaId = "Bomba_Reservorio_01") => {
    // El cron job se ejecutará cada 5 minutos
    cron.schedule('*/20 * * * *', async () => {
        console.log(`\n--- Ejecutando análisis programado para ${bombaId} (${new Date().toLocaleTimeString('es-AR')}) ---`);
        
        try {
            await analizarArranquesRepetitivos(bombaId);
            await analizarFuncionamientoProlongado(bombaId);
        } catch (error) {
            console.error('Error fatal durante el análisis de la bomba:', error);
        }
    }, {
        scheduled: true,
        timezone: "America/Argentina/Buenos_Aires"
    });
    
    console.log('Programación de análisis de bomba iniciada (cada 5 minutos).');
};

module.exports = { iniciarAnalisis };