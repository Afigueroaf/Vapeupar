import { RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { EnvConfig, paramName, resourceName } from './config.js';

interface StorageStackProps extends StackProps {
  config: EnvConfig;
}

/**
 * Imágenes de catálogo: bucket privado servido por CloudFront (OAC).
 *
 * El bucket no es público: solo CloudFront lo lee. La escritura entra
 * únicamente con URL prefirmada que emite el backend (ADR-002 §8), por eso la
 * única regla CORS es PUT desde la consola.
 */
export class StorageStack extends Stack {
  constructor(scope: Construct, id: string, props: StorageStackProps) {
    super(scope, id, props);
    const { config } = props;
    const isDisposable = config.storage.removalPolicy === RemovalPolicy.DESTROY;

    const bucket = new s3.Bucket(this, 'CatalogBucket', {
      bucketName: resourceName(config, `catalog-${this.account}`),
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: config.storage.versioned,
      cors: config.storage.uploadOrigins.length
        ? [{
            allowedMethods: [s3.HttpMethods.PUT],
            allowedOrigins: config.storage.uploadOrigins,
            allowedHeaders: ['*'],
            maxAge: 3000,
          }]
        : undefined,
      removalPolicy: config.storage.removalPolicy,
      autoDeleteObjects: isDisposable,
    });

    const distribution = new cloudfront.Distribution(this, 'CatalogCdn', {
      comment: `${resourceName(config, 'catalog')} imagenes de catalogo`,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      priceClass: config.storage.cdnPriceClassAll
        ? cloudfront.PriceClass.PRICE_CLASS_ALL
        : cloudfront.PriceClass.PRICE_CLASS_100,
    });

    new ssm.StringParameter(this, 'ParamBucket', {
      parameterName: paramName(config, 'S3_CATALOG_BUCKET'),
      stringValue: bucket.bucketName,
    });
    new ssm.StringParameter(this, 'ParamCdnDomain', {
      parameterName: paramName(config, 'CDN_DOMAIN'),
      stringValue: distribution.distributionDomainName,
    });
  }
}
