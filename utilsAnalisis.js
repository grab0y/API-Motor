// services/analisisService.js

const cron = require('node-cron');
const https = require('https');
const Evento = require('./modelEventos'); // Asumo que son modelos de Mongoose
const Alerta = require('./modelAlertas'); // Asumo que son modelos de Mongoose
const nodemailer = require('nodemailer'); // Placeholder para integraciones de email

// ==============================
// CONFIGURACION DE ALERTAS Y SILENCIAMIENTO
// ==============================
const ALERTA_REPETICION_VECES = 3;
const ALERTA_REPETICION_PERIODO_MIN = 120; // 2 horas
const ALERTA_FUNCIONAMIENTO_MAX_MIN = 15;

// NUEVA CONFIGURACION: Tiempo para volver a notificar si la falla persiste.
const ALERTA_RENOTIFICACION_HORAS = 2; 

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';
const TELEGRAM_HABILITADO = Boolean(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID);

const TIPOS_ALERTA = Object.freeze({
    REPETICION: 'REPETICION',
    PROLONGADO: 'PROLONGADO'
});

// Variables de estado para la lógica de resolución (cerrar alerta en DB)
let alertaActivaRepeticion = false;
let alertaActivaProlongado = false;

// Variables de estado para el temporizador de re-notificación
let lastNotificationTimestampRepeticion = null;
let lastNotificationTimestampProlongado = null;

// ==============================
// UTILIDADES DE NOTIFICACION Y LOG
// ==============================
const enviarAlertaConsola = (asunto, cuerpo) => {
    console.log('-------------------------------------------');
    console.log('*** ALERTA DISPARADA ***');
    console.log(`ASUNTO: ${asunto}`);
    console.log(`CUERPO: ${cuerpo}`);
    console.log('-------------------------------------------');
};

const enviarTelegram = async (mensaje) => {
    if (!TELEGRAM_HABILITADO) {
        console.warn('[Alertas] Telegram no configurado (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID).');
        return;
    }

    await new Promise((resolve) => {
        const payload = JSON.stringify({
            chat_id: TELEGRAM_CHAT_ID,
            text: mensaje
        });

        const request = https.request({
            hostname: 'api.telegram.org',
            path: `/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            },
            timeout: 5000
        }, (res) => {
            res.on('data', () => {});
            res.on('end', resolve);
        });

        request.on('error', (error) => {
            console.error('[Alertas] Error al enviar mensaje de Telegram:', error.message);
            resolve();
        });

        request.on('timeout', () => {
            request.destroy();
            console.error('[Alertas] Timeout al enviar mensaje de Telegram.');
            resolve();
        });

        request.write(payload);
        request.end();
    });
};

const enviarAlerta = async (asunto, cuerpo) => {
    enviarAlertaConsola(asunto, cuerpo);
    await enviarTelegram(`${asunto}\n${cuerpo}`);
};

const registrarFalla = async ({ bombaId, tipo, descripcion, detalle }) => {
    try {
        const alerta = new Alerta({
            bombaId,
            tipo,
            descripcion,
            detalle
        });
        await alerta.save();
    } catch (error) {
        console.error('[Alertas] Error al guardar la falla en MongoDB:', error.message);
    }
};

const cerrarAlertasActivas = async ({ bombaId, tipo, mensajeResolucion }) => {
    try {
        await Alerta.updateMany(
            { bombaId, tipo, activo: true },
            { $set: { activo: false, mensajeResolucion, resueltaEn: new Date() } }
        );
    } catch (error) {
        console.error('[Alertas] Error al actualizar el estado de las alertas:', error.message);
    }
};

const procesarDisparoDeFalla = async ({ bombaId, tipo, asunto, cuerpo, detalle }) => {
    await registrarFalla({ bombaId, tipo, descripcion: cuerpo, detalle });
    await enviarAlerta(asunto, cuerpo);
};

// ==============================
// FUNCIONES DE ANALISIS
// ==============================

// 1. Analisis de arranques repetitivos (posible fuga)
const analizarArranquesRepetitivos = async (bombaId) => {
    const limiteTiempo = new Date(Date.now() - ALERTA_REPETICION_PERIODO_MIN * 60000);

    const arranques = await Evento.find({
        id_bomba: bombaId,
        estado: 'START',
        timestamp: { $gte: limiteTiempo }
    }).sort({ timestamp: -1 });

    const RE_NOTIFY_MS = ALERTA_RENOTIFICACION_HORAS * 60 * 60 * 1000;
    const isReNotificationDue = lastNotificationTimestampRepeticion
        ? (Date.now() - lastNotificationTimestampRepeticion) >= RE_NOTIFY_MS
        : true; // Es la primera vez

    if (arranques.length >= ALERTA_REPETICION_VECES) {
        
        // Se notifica si: 1) Es una nueva falla (alertaActiva=false) O 2) Es una falla persistente y el tiempo de re-notificación expiró.
        if (!alertaActivaRepeticion || isReNotificationDue) {

            const notifPrefix = alertaActivaRepeticion ? '[RE-AVISO] ' : '';
            const asunto = `${notifPrefix}ALERTA: - ${arranques.length} arranques en ${ALERTA_REPETICION_PERIODO_MIN} min`;
            const cuerpo = `La bomba ${bombaId} arranco ${arranques.length} veces en ${ALERTA_REPETICION_PERIODO_MIN} minutos. Posible fuga o flotante defectuoso.`;

            await procesarDisparoDeFalla({
                bombaId,
                tipo: TIPOS_ALERTA.REPETICION,
                asunto,
                cuerpo,
                detalle: {
                    cantidadArranques: arranques.length,
                    periodoMinutos: ALERTA_REPETICION_PERIODO_MIN
                }
            });

            // Actualizamos los estados
            alertaActivaRepeticion = true;
            lastNotificationTimestampRepeticion = Date.now(); // Guardamos el timestamp del nuevo aviso
            console.log('[Analisis Repeticion] FALLA DETECTADA/RE-NOTIFICADA.');

        } else {
            console.log('[Analisis Repeticion] FALLA ACTIVA. Silenciamiento temporal.');
        }
    } else {
        // Condición de resolución
        if (alertaActivaRepeticion) {
            console.log('[Analisis Repeticion] RESOLUCION. Ciclos normales.');
            await cerrarAlertasActivas({
                bombaId,
                tipo: TIPOS_ALERTA.REPETICION,
                mensajeResolucion: 'La bomba volvio a operar dentro de los arranques esperados.'
            });

            // Reseteamos los estados al resolverse
            alertaActivaRepeticion = false;
            lastNotificationTimestampRepeticion = null;
        } else {
            console.log('[Analisis Repeticion] OK. Ciclos normales.');
        }
    }
};

// 2. Analisis de funcionamiento prolongado (posible obstruccion)
const analizarFuncionamientoProlongado = async (bombaId) => {
    const ultimoStart = await Evento.findOne({
        id_bomba: bombaId,
        estado: 'START'
    }).sort({ timestamp: -1 });

    if (!ultimoStart) {
        if (alertaActivaProlongado) {
            console.log('[Analisis Prolongado] RESOLUCION. Sin eventos START recientes.');
            // Reseteamos los estados
            alertaActivaProlongado = false;
            lastNotificationTimestampProlongado = null;
        }
        return;
    }

    const stopPosterior = await Evento.findOne({
        id_bomba: bombaId,
        estado: 'STOP',
        timestamp: { $gt: ultimoStart.timestamp }
    }).sort({ timestamp: -1 });

    if (!stopPosterior) {
        const tiempoEncendidoMS = Date.now() - ultimoStart.timestamp.getTime();
        const tiempoEncendidoMin = Math.floor(tiempoEncendidoMS / 60000);

        if (tiempoEncendidoMin >= ALERTA_FUNCIONAMIENTO_MAX_MIN) {
            // Condición de falla: Encendida por tiempo prolongado
            
            const RE_NOTIFY_MS = ALERTA_RENOTIFICACION_HORAS * 60 * 60 * 1000;
            const isReNotificationDue = lastNotificationTimestampProlongado
                ? (Date.now() - lastNotificationTimestampProlongado) >= RE_NOTIFY_MS
                : true; // Es la primera vez

            // Se notifica si: 1) Es una nueva falla O 2) Es una falla persistente y el tiempo de re-notificación expiró.
            if (!alertaActivaProlongado || isReNotificationDue) {

                const notifPrefix = alertaActivaProlongado ? '[RE-AVISO] ' : '';
                const asunto = `${notifPrefix}ALERTA: Bomba encendida ${tiempoEncendidoMin} min`;
                const cuerpo = `La bomba ${bombaId} supero el limite de ${ALERTA_FUNCIONAMIENTO_MAX_MIN} minutos encendida. Posible obstruccion o fallo de flotante.`;

                await procesarDisparoDeFalla({
                    bombaId,
                    tipo: TIPOS_ALERTA.PROLONGADO,
                    asunto,
                    cuerpo,
                    detalle: {
                        minutosEncendida: tiempoEncendidoMin,
                        umbralMinutos: ALERTA_FUNCIONAMIENTO_MAX_MIN,
                        inicio: ultimoStart.timestamp
                    }
                });

                // Actualizamos los estados
                alertaActivaProlongado = true;
                lastNotificationTimestampProlongado = Date.now(); // Guardamos el timestamp del nuevo aviso
                console.log('[Analisis Prolongado] FALLA DETECTADA/RE-NOTIFICADA.');

            } else {
                console.log(`[Analisis Prolongado] FALLA ACTIVA (${tiempoEncendidoMin} min). Silenciamiento temporal.`);
            }
        } else {
            console.log(`[Analisis Prolongado] OK. Encendida por ${tiempoEncendidoMin} minutos.`);
        }
    } else {
        // Condición de resolución
        if (alertaActivaProlongado) {
            console.log('[Analisis Prolongado] RESOLUCION. La bomba se apago tras la alerta.');
            await cerrarAlertasActivas({
                bombaId,
                tipo: TIPOS_ALERTA.PROLONGADO,
                mensajeResolucion: 'La bomba se apago luego del periodo prolongado.'
            });
            
            // Reseteamos los estados al resolverse
            alertaActivaProlongado = false;
            lastNotificationTimestampProlongado = null;
        }
        console.log('[Analisis Prolongado] OK. Ciclo normal completado.');
    }
};

// ==============================
// CRON JOB PRINCIPAL
// ==============================

const iniciarAnalisis = (bombaId = 'Bomba_Reservorio_01') => {
    cron.schedule('*/4 * * * *', async () => {
        console.log(`\n--- Analisis programado para ${bombaId} (${new Date().toLocaleTimeString('es-AR')}) ---`);

        try {
            await analizarArranquesRepetitivos(bombaId);
            await analizarFuncionamientoProlongado(bombaId);
        } catch (error) {
            console.error('Error durante el analisis de la bomba:', error);
        }
    }, {
        scheduled: true,
        timezone: 'America/Argentina/Buenos_Aires'
    });

    console.log('Programacion de analisis de bomba iniciada (cada 4 minutos).');
};

module.exports = { iniciarAnalisis };