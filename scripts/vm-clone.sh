apt-get update && apt-get install -y git
cd /opt && rm -rf lazisnu
git clone https://github.com/bagus01darmawan-wq/lazisnu.git lazisnu
cd lazisnu
git checkout feature/sync-sprint-cleanup
ls
