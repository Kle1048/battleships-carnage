@echo off
echo Adding firewall rule for Battleships MMO Server...
netsh advfirewall firewall add rule name="Battleships MMO Server" dir=in action=allow protocol=TCP localport=3001
echo Done!
pause 