@echo off
REM =========================================================================
REM Windows batch wrapper for Make commands
REM Requires Make: choco install make OR install Git Bash OR use WSL
REM =========================================================================

where make >nul 2>nul
if %errorlevel% neq 0 (
    echo.
    echo ERROR: Make not found on your system
    echo.
    echo Please install Make using one of these options:
    echo   1. Chocolatey:  choco install make
    echo   2. Git Bash:    Comes with Git for Windows
    echo   3. WSL:         Use Windows Subsystem for Linux
    echo.
    echo For bioinformatics work, we recommend WSL.
    echo.
    exit /b 1
)

make %*
