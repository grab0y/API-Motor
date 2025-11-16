// services/analisisService.js

const cron = require('node-cron');
const https = require('https');
const Evento = require('./modelEventos');
const Alerta = require('./modelAlertas');
const nodemailer = require('nodemailer'); // Placeholder para integraciones de email

// ==============================
// CONFIGURACION DE ALERTAS Y SILENCIAMIENTO
// ==============================
const ALERTA_REPETICION_VECES = 3;
const ALERTA_REPETICION_PERIODO_MIN = 120;
const ALERTA_FUNCIONAMIENTO_MAX_MIN = 15;

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';
const TELEGRAM_HABILITADO = Boolean(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID);

const TIPOS_ALERTA = Object.freeze({
    REPETICION: 'REPETICION',
    PROLONGADO: 'PROLONGADO'
});

let alertaActivaRepeticion = false;
let alertaActivaProlongado = false;

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

    if (arranques.length >= ALERTA_REPETICION_VECES) {
        if (!alertaActivaRepeticion) {
            const asunto = `ALERTA: - ${arranques.length} arranques en ${ALERTA_REPETICION_PERIODO_MIN} min`;
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
            alertaActivaRepeticion = true;
            console.log('[Analisis Repeticion] FALLA DETECTADA.');
        } else {
            console.log('[Analisis Repeticion] FALLA ACTIVA. Silenciamiento.');
        }
    } else {
        if (alertaActivaRepeticion) {
            console.log('[Analisis Repeticion] RESOLUCION. Ciclos normales.');
            await cerrarAlertasActivas({
                bombaId,
                tipo: TIPOS_ALERTA.REPETICION,
                mensajeResolucion: 'La bomba volvio a operar dentro de los arranques esperados.'
            });
            alertaActivaRepeticion = false;
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
            alertaActivaProlongado = false;
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
            if (!alertaActivaProlongado) {
                const asunto = `ALERTA: Bomba encendida ${tiempoEncendidoMin} min`;
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
                alertaActivaProlongado = true;
                console.log('[Analisis Prolongado] FALLA DETECTADA.');
            } else {
                console.log(`[Analisis Prolongado] FALLA ACTIVA (${tiempoEncendidoMin} min). Silenciamiento.`);
            }
        } else {
            console.log(`[Analisis Prolongado] OK. Encendida por ${tiempoEncendidoMin} minutos.`);
        }
    } else {
        if (alertaActivaProlongado) {
            console.log('[Analisis Prolongado] RESOLUCION. La bomba se apago tras la alerta.');
            await cerrarAlertasActivas({
                bombaId,
                tipo: TIPOS_ALERTA.PROLONGADO,
                mensajeResolucion: 'La bomba se apago luego del periodo prolongado.'
            });
            alertaActivaProlongado = false;
        }
        console.log('[Analisis Prolongado] OK. Ciclo normal completado.');
    }
};

// ==============================
// CRON JOB PRINCIPAL
// ==============================

const iniciarAnalisis = (bombaId = 'Bomba_Reservorio_01') => {
    cron.schedule('*/1 * * * *', async () => {
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
