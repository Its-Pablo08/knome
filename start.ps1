$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $ScriptDir) { $ScriptDir = (Get-Location).Path }
& "$ScriptDir\Knome main\START_KNOME.ps1" @args
