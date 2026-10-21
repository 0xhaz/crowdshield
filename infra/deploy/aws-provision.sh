#!/usr/bin/env bash
# Creates the public demo VM on AWS (idempotent where it can be): key pair, security group
# (80/443 open, SSH from this machine's IP only), Ubuntu 24.04 arm64 t4g.large with Docker, and an
# Elastic IP. Prints the sslip.io domain to pass to make-env.sh. Region defaults to us-east-1.
set -euo pipefail
export AWS_REGION="${AWS_REGION:-us-east-1}" AWS_PAGER=""
NAME=crowdshield-demo
KEY="$HOME/.ssh/$NAME.pem"
TYPE="${INSTANCE_TYPE:-t4g.large}"

if ! aws ec2 describe-key-pairs --key-names "$NAME" >/dev/null 2>&1; then
  aws ec2 create-key-pair --key-name "$NAME" --key-type ed25519 \
    --tag-specifications "ResourceType=key-pair,Tags=[{Key=Project,Value=crowdshield}]" \
    --query KeyMaterial --output text >"$KEY"
  chmod 400 "$KEY"
fi

VPC=$(aws ec2 describe-vpcs --filters Name=isDefault,Values=true --query 'Vpcs[0].VpcId' --output text)
SG=$(aws ec2 describe-security-groups --filters Name=group-name,Values=$NAME Name=vpc-id,Values=$VPC \
  --query 'SecurityGroups[0].GroupId' --output text)
if [ "$SG" = "None" ]; then
  SG=$(aws ec2 create-security-group --group-name $NAME --description "CrowdShield public demo" \
    --vpc-id "$VPC" --query GroupId --output text)
  aws ec2 authorize-security-group-ingress --group-id "$SG" --ip-permissions \
    'IpProtocol=tcp,FromPort=80,ToPort=80,IpRanges=[{CidrIp=0.0.0.0/0}],Ipv6Ranges=[{CidrIpv6=::/0}]' \
    'IpProtocol=tcp,FromPort=443,ToPort=443,IpRanges=[{CidrIp=0.0.0.0/0}],Ipv6Ranges=[{CidrIpv6=::/0}]' >/dev/null
fi
MYIP=$(curl -fsS https://checkip.amazonaws.com)
aws ec2 authorize-security-group-ingress --group-id "$SG" \
  --ip-permissions "IpProtocol=tcp,FromPort=22,ToPort=22,IpRanges=[{CidrIp=$MYIP/32,Description=admin}]" \
  >/dev/null 2>&1 || true

ID=$(aws ec2 describe-instances --filters Name=tag:Name,Values=$NAME \
  Name=instance-state-name,Values=pending,running,stopped --query 'Reservations[0].Instances[0].InstanceId' --output text)
if [ "$ID" = "None" ]; then
  AMI=$(aws ssm get-parameter --name /aws/service/canonical/ubuntu/server/24.04/stable/current/arm64/hvm/ebs-gp3/ami-id \
    --query Parameter.Value --output text)
  USERDATA=$(mktemp)
  cat >"$USERDATA" <<'UD'
#!/bin/bash
set -eux
apt-get update
apt-get install -y ca-certificates curl rsync
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
echo "deb [arch=arm64 signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu noble stable" >/etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
usermod -aG docker ubuntu
fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >>/etc/fstab
mkdir -p /opt/crowdshield && chown ubuntu:ubuntu /opt/crowdshield
touch /var/lib/cloud/instance/docker-ready
UD
  ID=$(aws ec2 run-instances --image-id "$AMI" --instance-type "$TYPE" --key-name $NAME \
    --security-group-ids "$SG" --user-data "file://$USERDATA" \
    --block-device-mappings 'DeviceName=/dev/sda1,Ebs={VolumeSize=30,VolumeType=gp3,Encrypted=true}' \
    --metadata-options HttpTokens=required,HttpEndpoint=enabled \
    --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=$NAME},{Key=Project,Value=crowdshield}]" \
    --query 'Instances[0].InstanceId' --output text)
  rm "$USERDATA"
fi
aws ec2 wait instance-running --instance-ids "$ID"

EIP=$(aws ec2 describe-addresses --filters Name=tag:Name,Values=$NAME --query 'Addresses[0].PublicIp' --output text)
if [ "$EIP" = "None" ]; then
  ALLOC=$(aws ec2 allocate-address --domain vpc \
    --tag-specifications "ResourceType=elastic-ip,Tags=[{Key=Name,Value=$NAME},{Key=Project,Value=crowdshield}]" \
    --query AllocationId --output text)
  aws ec2 associate-address --instance-id "$ID" --allocation-id "$ALLOC" >/dev/null
  EIP=$(aws ec2 describe-addresses --allocation-ids "$ALLOC" --query 'Addresses[0].PublicIp' --output text)
fi
echo "instance $ID  ip $EIP  ssh: ssh -i $KEY ubuntu@$EIP"
echo "domain: crowdshield.${EIP//./-}.sslip.io"
