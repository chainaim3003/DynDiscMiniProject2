@echo off
set "WSLP=/mnt/c/CHAINAIM3003/mcp-servers/MOD aathi/DynDiscMiniProject2/legentvLEI"
echo Stopping vLEI environment...
wsl bash -c "cd \"%WSLP%\" && bash stop.sh"
echo Done.
pause
