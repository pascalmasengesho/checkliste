@echo off
setlocal
cd /d "%~dp0"
echo.
echo  Kigali Maintenance Daily Checklist
echo  ----------------------------------
echo.
echo  Starting the local app in your browser...
echo  Your form is processed on this device.
echo  Keep this window open while you fill in the form.
echo.
python server.py
if errorlevel 1 (
    echo.
    echo The checklist app stopped because of an error.
    pause
)
endlocal
