import { App } from 'aws-cdk-lib';
import { buildApp } from '../lib/build-app.js';
import { getConfig } from '../lib/config.js';

const app = new App();
const config = getConfig(app.node.tryGetContext('env') ?? 'dev');

// Correo de alertas (presupuesto y alarmas): fuera del repositorio (dato personal).
const alertEmail = app.node.tryGetContext('alertEmail') ?? process.env.VAPEUPAR_ALERT_EMAIL;
if (!alertEmail) {
  throw new Error('Falta el correo de alertas: exporta VAPEUPAR_ALERT_EMAIL o pasa -c alertEmail=...');
}

buildApp(app, config, alertEmail);
