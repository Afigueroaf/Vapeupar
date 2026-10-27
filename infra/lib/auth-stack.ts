import { Duration, Stack, StackProps } from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { EnvConfig, paramName, resourceName } from './config.js';

interface AuthStackProps extends StackProps {
  config: EnvConfig;
}

/**
 * Usuarios de la consola /admin (ADR-002 §6).
 *
 * Sin registro público: las altas son por invitación desde el backend
 * (AdminCreateUser). El navegador nunca habla con Cognito; el backend
 * autentica con su cliente confidencial y guarda los tokens en cookies
 * httpOnly.
 *
 * Dev usa el correo integrado de Cognito (límite diario bajo, suficiente para
 * invitar a un par de personas). Prod debe pasar a SES con dominio verificado.
 */
export class AuthStack extends Stack {
  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props);
    const { config } = props;

    const userPool = new cognito.UserPool(this, 'AdminUserPool', {
      userPoolName: resourceName(config, 'admins'),
      featurePlan: cognito.FeaturePlan.LITE,
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      signInCaseSensitive: false,
      autoVerify: { email: true },
      standardAttributes: { email: { required: true, mutable: true } },
      passwordPolicy: {
        minLength: 12,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
        tempPasswordValidity: Duration.days(3),
      },
      mfa: config.auth.mfaRequired ? cognito.Mfa.REQUIRED : cognito.Mfa.OPTIONAL,
      mfaSecondFactor: { otp: true, sms: false },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      email: cognito.UserPoolEmail.withCognito(),
      userInvitation: {
        emailSubject: 'Invitación a la consola de Vapeupar',
        emailBody:
          'Te invitaron a la consola de administración de Vapeupar.<br>' +
          'Usuario: {username}<br>Contraseña temporal: {####}<br>' +
          'Tendrás que cambiarla en el primer inicio de sesión. Vence en 3 días.',
      },
      deletionProtection: config.envName === 'prod',
      removalPolicy: config.auth.removalPolicy,
    });

    const backendClient = userPool.addClient('BackendClient', {
      userPoolClientName: resourceName(config, 'backend'),
      generateSecret: true,
      authFlows: { userPassword: true },
      preventUserExistenceErrors: true,
      enableTokenRevocation: true,
      accessTokenValidity: Duration.minutes(60),
      idTokenValidity: Duration.minutes(60),
      refreshTokenValidity: Duration.days(7),
    });

    const clientSecret = new secretsmanager.Secret(this, 'BackendClientSecret', {
      secretName: `vapeupar/${config.envName}/cognito-backend-client`,
      description: 'Secreto del cliente confidencial de Cognito usado por el backend',
      secretStringValue: backendClient.userPoolClientSecret,
    });

    const params: Record<string, string> = {
      COGNITO_USER_POOL_ID: userPool.userPoolId,
      COGNITO_CLIENT_ID: backendClient.userPoolClientId,
      COGNITO_CLIENT_SECRET_ARN: clientSecret.secretArn,
    };
    for (const [key, value] of Object.entries(params)) {
      new ssm.StringParameter(this, `Param${key}`, {
        parameterName: paramName(config, key),
        stringValue: value,
      });
    }
  }
}
