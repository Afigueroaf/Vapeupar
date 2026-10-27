import { Stack, StackProps } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import { EnvConfig, resourceName } from './config.js';

interface NetworkStackProps extends StackProps {
  config: EnvConfig;
}

/**
 * VPC propia de Vapeupar, separada de la de DeliPan.
 *
 * Sin NAT Gateway a propósito (~32 USD/mes aunque no se use): la base de datos
 * vive en subredes aisladas sin salida a internet, y el acceso a S3 desde esas
 * subredes va por el endpoint de gateway, que es gratuito.
 */
export class NetworkStack extends Stack {
  readonly vpc: ec2.Vpc;

  constructor(scope: Construct, id: string, props: NetworkStackProps) {
    super(scope, id, props);
    const { config } = props;

    this.vpc = new ec2.Vpc(this, 'Vpc', {
      vpcName: resourceName(config, 'vpc'),
      ipAddresses: ec2.IpAddresses.cidr(config.vpcCidr),
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        { name: 'public', subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        { name: 'isolated', subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
      gatewayEndpoints: {
        S3: { service: ec2.GatewayVpcEndpointAwsService.S3 },
      },
      restrictDefaultSecurityGroup: true,
    });
  }
}
