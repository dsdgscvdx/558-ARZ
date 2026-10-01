# CrazyGames submission — MiG-29 Repair Simulator

Upload file: `dist/558-arz-crazygames.zip` (contains a single `index.html`, ~1.3 MB unpacked).
Rebuild it any time with `npm run build:crazygames`.

## Basic info

- **Title:** MiG-29 Repair Simulator
- **Category:** Simulation
- **Tags:** simulation, 3d, airplane, mechanic, realistic, first person, repair, military
- **Orientation / devices:** landscape; desktop (mouse + keyboard). Touch controls exist, but the game is heavy for phones — list it as desktop only.

## Short description

Repair a real MiG-29 fighter jet by hand: inspect it, find the faults, order parts, swap engine components, run up the RD-33 engines and tune the radar before Quality Control signs it off.

## Full description

Baranovichi, Belarus. A Belarusian Air Force MiG-29BM stands on hydraulic jacks in the hangar of the 558th Aircraft Repair Plant — and you are the new technician.

Take a work order from the board, walk up to the jet and inspect it. Some faults are visible, others need instruments, and some are hidden defects that aren't even in the order. Order new or used parts from supply, remove units from the outside in and install them from the inside out: radome and radar, avionics harness, battery, fuel tank seals, hydraulic reservoir and hoses, wheels, brakes, shock struts, stabilator actuators, cowlings, compressor and turbine blades, fuel control units, oil pumps and afterburner nozzles.

Then prove your work. Tow the aircraft out and run the RD-33 engines up through idle, nominal, maximum and afterburner while watching exhaust temperature, oil pressure, vibration and hydraulics — ignore a red needle for too long and you get a fire or a compressor stall. Tune the Topaz radar on the test set: power-up, built-in test, frequency calibration and antenna boresighting. Finally submit the jet to Quality Control and get paid.

- 12 work orders, from a simple brake change to preparing the jet for the July 3 air parade
- 38 removable units, hidden defects, used parts with possible flaws, repair kits
- Detailed procedural MiG-29 with a working cockpit, RD-33 engines and engine bays
- Walk around the hangar in first or third person, climb ladders, sit in the cockpit
- Promotions from apprentice fitter to chief engineer

## Controls

- Click to capture the mouse, mouse — look
- W A S D — walk, Shift — run, Ctrl — crouch, Space — jump
- E — interact (inspect part, canopy, doors, order board, supply, stores, tractor, radar test set, QC)
- Q — ladder / cockpit, F — flashlight, T — first/third person, C — free camera
- Esc / Tab — tablet menu; N orders, M supply, B stores, I inspection mode, V defect sheet, G engine run-up, R radar, O submit to QC, H help

## Cover images

- `docs/crazygames/cover-1920x1080.jpg` (landscape)
- `docs/crazygames/cover-800x1200.jpg` (portrait)
- `docs/crazygames/cover-800x800.jpg` (square)

## SDK integration (CrazyGames SDK v3)

The build loads `https://sdk.crazygames.com/crazygames-sdk-v3.js`, calls `SDK.init()`, reports
`loadingStart / loadingStop` around the 3D loading, `gameplayStart / gameplayStop` when the player is in the
game vs. in the main menu or paused, and `happytime()` when an aircraft passes QC. No ads are requested.
Saves use `localStorage`.
