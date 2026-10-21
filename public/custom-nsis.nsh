!ifndef nsProcess::FindProcess
  !include "nsProcess.nsh"
!endif

!macro customInit
  ${nsProcess::KillProcess} "${APP_EXECUTABLE_FILENAME}" $R0
  ${nsProcess::KillProcess} "old-uninstaller.exe" $R0
  ${nsProcess::KillProcess} "Uninstall ${PRODUCT_FILENAME}.exe" $R0
  ${nsProcess::Unload}
  !ifndef BUILD_UNINSTALLER
    DeleteRegKey SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}"
    DeleteRegKey HKCU "${UNINSTALL_REGISTRY_KEY}"
    !ifdef UNINSTALL_REGISTRY_KEY_2
      DeleteRegKey SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY_2}"
      DeleteRegKey HKCU "${UNINSTALL_REGISTRY_KEY_2}"
    !endif
  !endif
!macroend

!macro customCheckAppRunning
  ${nsProcess::KillProcess} "${APP_EXECUTABLE_FILENAME}" $R0
  ${nsProcess::KillProcess} "old-uninstaller.exe" $R0
  ${nsProcess::KillProcess} "Uninstall ${PRODUCT_FILENAME}.exe" $R0
  ${nsProcess::Unload}
  Sleep 500
  !ifndef BUILD_UNINSTALLER
    DeleteRegKey SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}"
    DeleteRegKey HKCU "${UNINSTALL_REGISTRY_KEY}"
    !ifdef UNINSTALL_REGISTRY_KEY_2
      DeleteRegKey SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY_2}"
      DeleteRegKey HKCU "${UNINSTALL_REGISTRY_KEY_2}"
    !endif
    ${if} $INSTDIR != ""
      RMDir /r "$INSTDIR"
    ${endif}
  !endif
!macroend

!macro customRemoveFiles
  ${nsProcess::KillProcess} "${APP_EXECUTABLE_FILENAME}" $R0
  ${nsProcess::Unload}
  Sleep 400
  RMDir /r $INSTDIR
!macroend
