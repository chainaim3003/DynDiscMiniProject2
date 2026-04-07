#!/bin/bash
# create-geda-aid.sh - Create GEDA AID using KERIpy KLI through Docker
# This script creates the GLEIF External Delegated AID using the KERIpy KLI tool
# It should equal EAQRpV-M8AAN-_OkHmUb8-ulTEyz9foI_BM1ckhrDetr

set -e

echo "Creating GEDA AID using SignifyTS and KERIA"

# Skip creation if GEDA already exists in task-data
if [ -f "./task-data/geda-aid.txt" ] && [ -f "./task-data/geda-info.json" ]; then
    GEDA_PREFIX=$(cat ./task-data/geda-aid.txt | tr -d " \t\n\r")
    GEDA_OOBI=$(cat ./task-data/geda-info.json | jq -r .oobi)
    echo "   GEDA AID already exists — skipping creation"
    echo "   Prefix: ${GEDA_PREFIX}"
    echo "   OOBI: ${GEDA_OOBI}"
    exit 0
fi

# gets GEDA_SALT
source ./task-scripts/workshop-env-vars.sh

# Create GEDA Agent and AID
docker compose exec tsx-shell \
  /vlei/tsx-script-runner.sh geda/geda-aid-create.ts \
    'docker' \
    "${GEDA_SALT}" \
    "/task-data"

# Get the prefix
GEDA_PREFIX=$(cat ./task-data/geda-aid.txt | tr -d " \t\n\r")
echo "   Prefix: ${GEDA_PREFIX}"

GEDA_OOBI=$(cat ./task-data/geda-info.json | jq -r .oobi)
echo "   OOBI: ${GEDA_OOBI}"


