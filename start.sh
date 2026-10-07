#!/usr/bin/env bash
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$(dirname "$0")/Knome main/START_KNOME.ps1" "$@"
