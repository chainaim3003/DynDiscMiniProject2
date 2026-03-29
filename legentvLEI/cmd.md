set .env in legentvLEI/.env

.env :
UID=1000
GID=1000


./stop.sh
./setup.sh
./deploy.sh
./saidify-and-restart.sh
./run-all-buyerseller-4D-with-subdelegation.sh
./DEEP-EXT-subagent.sh JupiterTreasuryAgent jupiterSellerAgent





Manual Steps :

./run-all-buyerseller-4C-with-agents.sh
./DEEP-EXT-credential.sh


./generate-subagent-brans.sh

./task-scripts/subagent/subagent-delegate-with-unique-bran.sh \
    JupiterTreasuryAgent \
    jupiterSellerAgent