# DTC catalog — DRDX

Decoded from the DTC enable region 0x00F900..0x00FD00.

Each slot is 4 bytes: `<enable> 0x00 <BCD-hi> <BCD-lo>` → P-code.

## Summary

- DTC-shaped slots: **235**
- Enabled (bit 7 set): **126**  (known in DTC_DB: 18, **new candidates: 108**)
- Disabled: 109
- Other 4-byte slots in region (calibration / non-DTC): 21

### Enable byte distribution

| Byte | Count | Bits | Meaning hypothesis |
|------|-------|------|---------------------|
| 0x00 | 72 | 00000000 | disabled |
| 0xA0 | 72 | 10100000 | enabled|noMIL |
| 0xC0 | 49 | 11000000 | enabled|MIL |
| 0x60 | 31 | 01100000 | non-enable (0x60) |
| 0x08 | 2 | 00001000 | non-enable (0x08) |
| 0xA4 | 2 | 10100100 | enabled|noMIL|bit2 |
| 0xE0 | 2 | 11100000 | enabled|MIL|noMIL |
| 0x05 | 1 | 00000101 | non-enable (0x05) |
| 0x20 | 1 | 00100000 | non-enable (0x20) |
| 0xC4 | 1 | 11000100 | enabled|MIL|bit2 |
| 0x28 | 1 | 00101000 | non-enable (0x28) |
| 0x01 | 1 | 00000001 | non-enable (0x01) |

## Enabled DTCs not in DTC_DB (new candidates for review)

| Addr | Code | Enable | Slot bytes |
|------|------|--------|------------|
| 0x00F96C | P1850 | 0xC0 (enabled|MIL) | `C0 00 18 50` |
| 0x00F978 | P1574 | 0xC0 (enabled|MIL) | `C0 00 15 74` |
| 0x00F984 | P0571 | 0xC0 (enabled|MIL) | `C0 00 05 71` |
| 0x00F990 | P0444 | 0xC0 (enabled|MIL) | `C0 00 04 44` |
| 0x00F994 | P0445 | 0xC0 (enabled|MIL) | `C0 00 04 45` |
| 0x00F9A0 | P0606 | 0xC0 (enabled|MIL) | `C0 00 06 06` |
| 0x00F9A4 | P0602 | 0xC0 (enabled|MIL) | `C0 00 06 02` |
| 0x00F9AC | P0118 | 0xA0 (enabled|noMIL) | `A0 00 01 18` |
| 0x00F9B0 | P1115 | 0xC0 (enabled|MIL) | `C0 00 11 15` |
| 0x00F9B4 | P0117 | 0xA0 (enabled|noMIL) | `A0 00 01 17` |
| 0x00F9B8 | P1114 | 0xC0 (enabled|MIL) | `C0 00 11 14` |
| 0x00F9BC | P0125 | 0xA0 (enabled|noMIL) | `A0 00 01 25` |
| 0x00F9C0 | P0336 | 0xA0 (enabled|noMIL) | `A0 00 03 36` |
| 0x00F9C4 | P0337 | 0xA4 (enabled|noMIL|bit2) | `A4 00 03 37` |
| 0x00F9CC | P0566 | 0xC0 (enabled|MIL) | `C0 00 05 66` |
| 0x00F9D8 | P0565 | 0xC0 (enabled|MIL) | `C0 00 05 65` |
| 0x00F9DC | P0567 | 0xC0 (enabled|MIL) | `C0 00 05 67` |
| 0x00F9E0 | P0568 | 0xC0 (enabled|MIL) | `C0 00 05 68` |
| 0x00F9EC | P0401 | 0xA0 (enabled|noMIL) | `A0 00 04 01` |
| 0x00F9F0 | P1404 | 0xA0 (enabled|noMIL) | `A0 00 14 04` |
| 0x00F9F4 | P0402 | 0xA0 (enabled|noMIL) | `A0 00 04 02` |
| 0x00F9F8 | P0404 | 0xA0 (enabled|noMIL) | `A0 00 04 04` |
| 0x00F9FC | P0406 | 0xA0 (enabled|noMIL) | `A0 00 04 06` |
| 0x00FA00 | P0405 | 0xA0 (enabled|noMIL) | `A0 00 04 05` |
| 0x00FA28 | P1271 | 0xC0 (enabled|MIL) | `C0 00 12 71` |
| 0x00FA2C | P1273 | 0xC0 (enabled|MIL) | `C0 00 12 73` |
| 0x00FA30 | P1272 | 0xC0 (enabled|MIL) | `C0 00 12 72` |
| 0x00FA34 | P1275 | 0xA0 (enabled|noMIL) | `A0 00 12 75` |
| 0x00FA38 | P1280 | 0xA0 (enabled|noMIL) | `A0 00 12 80` |
| 0x00FA3C | P1285 | 0xA0 (enabled|noMIL) | `A0 00 12 85` |
| 0x00FA40 | P0606 | 0xC0 (enabled|MIL) | `C0 00 06 06` |
| 0x00FA54 | P1120 | 0xA0 (enabled|noMIL) | `A0 00 11 20` |
| 0x00FA58 | P1220 | 0xA0 (enabled|noMIL) | `A0 00 12 20` |
| 0x00FA5C | P1221 | 0xC0 (enabled|MIL) | `C0 00 12 21` |
| 0x00FA60 | P1523 | 0xC0 (enabled|MIL) | `C0 00 15 23` |
| 0x00FA64 | P1635 | 0xC0 (enabled|MIL) | `C0 00 16 35` |
| 0x00FA68 | P1639 | 0xC0 (enabled|MIL) | `C0 00 16 39` |
| 0x00FA78 | P0606 | 0xC0 (enabled|MIL) | `C0 00 06 06` |
| 0x00FA90 | P0604 | 0xC0 (enabled|MIL) | `C0 00 06 04` |
| 0x00FA94 | P1636 | 0xC0 (enabled|MIL) | `C0 00 16 36` |
| 0x00FAAC | P0461 | 0xA0 (enabled|noMIL) | `A0 00 04 61` |
| 0x00FAB0 | P0464 | 0xC0 (enabled|MIL) | `C0 00 04 64` |
| 0x00FAB4 | P0463 | 0xA0 (enabled|noMIL) | `A0 00 04 63` |
| 0x00FAB8 | P0462 | 0xA0 (enabled|noMIL) | `A0 00 04 62` |
| 0x00FABC | P0171 | 0xA0 (enabled|noMIL) | `A0 00 01 71` |
| 0x00FAC0 | P0172 | 0xA0 (enabled|noMIL) | `A0 00 01 72` |
| 0x00FAC4 | P0174 | 0xA0 (enabled|noMIL) | `A0 00 01 74` |
| 0x00FAC8 | P0175 | 0xA0 (enabled|noMIL) | `A0 00 01 75` |
| 0x00FAE0 | P0113 | 0xA0 (enabled|noMIL) | `A0 00 01 13` |
| 0x00FAE4 | P1111 | 0xC0 (enabled|MIL) | `C0 00 11 11` |
| 0x00FAE8 | P0112 | 0xA0 (enabled|noMIL) | `A0 00 01 12` |
| 0x00FAEC | P1112 | 0xC0 (enabled|MIL) | `C0 00 11 12` |
| 0x00FAF0 | P0507 | 0xA0 (enabled|noMIL) | `A0 00 05 07` |
| 0x00FAF4 | P0506 | 0xA0 (enabled|noMIL) | `A0 00 05 06` |
| 0x00FB30 | P1340 | 0xA0 (enabled|noMIL) | `A0 00 13 40` |
| 0x00FB3C | P0325 | 0xA0 (enabled|noMIL) | `A0 00 03 25` |
| 0x00FB6C | P0103 | 0xA0 (enabled|noMIL) | `A0 00 01 03` |
| 0x00FB70 | P0102 | 0xA0 (enabled|noMIL) | `A0 00 01 02` |
| 0x00FB74 | P0101 | 0xA0 (enabled|noMIL) | `A0 00 01 01` |
| 0x00FB78 | P0108 | 0xA0 (enabled|noMIL) | `A0 00 01 08` |
| 0x00FB7C | P1106 | 0xC4 (enabled|MIL|bit2) | `C4 00 11 06` |
| 0x00FB80 | P0107 | 0xA0 (enabled|noMIL) | `A0 00 01 07` |
| 0x00FB84 | P1107 | 0xC0 (enabled|MIL) | `C0 00 11 07` |
| 0x00FB88 | P0106 | 0xA0 (enabled|noMIL) | `A0 00 01 06` |
| 0x00FB94 | P0300 | 0xA0 (enabled|noMIL) | `A0 00 03 00` |
| 0x00FBA0 | P1640 | 0xC0 (enabled|MIL) | `C0 00 16 40` |
| 0x00FBB4 | P1650 | 0xC0 (enabled|MIL) | `C0 00 16 50` |
| 0x00FBB8 | P0135 | 0xA0 (enabled|noMIL) | `A0 00 01 35` |
| 0x00FBBC | P1171 | 0xC0 (enabled|MIL) | `C0 00 11 71` |
| 0x00FBC0 | P0134 | 0xA0 (enabled|noMIL) | `A0 00 01 34` |
| 0x00FBC4 | P0133 | 0xA0 (enabled|noMIL) | `A0 00 01 33` |
| 0x00FBC8 | P1134 | 0xA0 (enabled|noMIL) | `A0 00 11 34` |
| 0x00FBCC | P1133 | 0xA0 (enabled|noMIL) | `A0 00 11 33` |
| 0x00FBD0 | P1167 | 0xC0 (enabled|MIL) | `C0 00 11 67` |
| 0x00FBD4 | P0132 | 0xA0 (enabled|noMIL) | `A0 00 01 32` |
| 0x00FBD8 | P0131 | 0xA0 (enabled|noMIL) | `A0 00 01 31` |
| 0x00FBDC | P0141 | 0xA0 (enabled|noMIL) | `A0 00 01 41` |
| 0x00FBE0 | P0140 | 0xA0 (enabled|noMIL) | `A0 00 01 40` |
| 0x00FBE4 | P0138 | 0xA0 (enabled|noMIL) | `A0 00 01 38` |
| 0x00FBE8 | P0137 | 0xA0 (enabled|noMIL) | `A0 00 01 37` |
| 0x00FBEC | P0155 | 0xA0 (enabled|noMIL) | `A0 00 01 55` |
| 0x00FBF0 | P1171 | 0xC0 (enabled|MIL) | `C0 00 11 71` |
| 0x00FBF4 | P0154 | 0xA0 (enabled|noMIL) | `A0 00 01 54` |
| 0x00FBF8 | P0153 | 0xA0 (enabled|noMIL) | `A0 00 01 53` |
| 0x00FBFC | P1154 | 0xA0 (enabled|noMIL) | `A0 00 11 54` |
| 0x00FC00 | P1153 | 0xA0 (enabled|noMIL) | `A0 00 11 53` |
| 0x00FC04 | P1169 | 0xC0 (enabled|MIL) | `C0 00 11 69` |
| 0x00FC08 | P0152 | 0xA0 (enabled|noMIL) | `A0 00 01 52` |
| 0x00FC0C | P0151 | 0xA0 (enabled|noMIL) | `A0 00 01 51` |
| 0x00FC10 | P0161 | 0xA0 (enabled|noMIL) | `A0 00 01 61` |
| 0x00FC14 | P0160 | 0xA0 (enabled|noMIL) | `A0 00 01 60` |
| 0x00FC18 | P0158 | 0xA0 (enabled|noMIL) | `A0 00 01 58` |
| 0x00FC1C | P0157 | 0xA0 (enabled|noMIL) | `A0 00 01 57` |
| 0x00FC5C | P0563 | 0xA4 (enabled|noMIL|bit2) | `A4 00 05 63` |
| 0x00FC60 | P0562 | 0xC0 (enabled|MIL) | `C0 00 05 62` |
| 0x00FC64 | P0453 | 0xA0 (enabled|noMIL) | `A0 00 04 53` |
| 0x00FC68 | P0452 | 0xA0 (enabled|noMIL) | `A0 00 04 52` |
| 0x00FC6C | P1860 | 0xA0 (enabled|noMIL) | `A0 00 18 60` |
| 0x00FC80 | P0218 | 0xC0 (enabled|MIL) | `C0 00 02 18` |
| 0x00FC90 | P0128 | 0xA0 (enabled|noMIL) | `A0 00 01 28` |
| 0x00FCB0 | P1870 | 0xA0 (enabled|noMIL) | `A0 00 18 70` |
| 0x00FCB4 | P0447 | 0xC0 (enabled|MIL) | `C0 00 04 47` |
| 0x00FCB8 | P0448 | 0xC0 (enabled|MIL) | `C0 00 04 48` |
| 0x00FCBC | P0660 | 0xC0 (enabled|MIL) | `C0 00 06 60` |
| 0x00FCC0 | P0662 | 0xC0 (enabled|MIL) | `C0 00 06 62` |
| 0x00FCC4 | P0502 | 0xA0 (enabled|noMIL) | `A0 00 05 02` |
| 0x00FCD0 | P0606 | 0xC0 (enabled|MIL) | `C0 00 06 06` |
| 0x00FCD4 | P0606 | 0xC0 (enabled|MIL) | `C0 00 06 06` |

## Known DTCs from DTC_DB found in this scan

| Addr | Code | Description | Enable | Matches default? |
|------|------|-------------|--------|------------------|
| 0x00F97C | P0724 | TRS Circuit | 0xC0 | ✓ |
| 0x00F980 | P0719 | TCC Brake Switch | 0xC0 | ✓ |
| 0x00FAD4 | P0730 | Incorrect Gear Ratio | 0xE0 | ✓ |
| 0x00FC20 | P0748 | Pressure Ctrl Sol Electrical | 0xE0 | ✓ |
| 0x00FC28 | P0705 | TR Sensor Circuit | 0xC0 | ✓ |
| 0x00FC2C | P0706 | TR Sensor Range | 0xC0 | ✓ |
| 0x00FC34 | P0753 | Shift Sol A Electrical | 0xA0 | ✓ |
| 0x00FC40 | P0751 | Shift Sol A Performance | 0xA0 | ✓ |
| 0x00FC44 | P0752 | Shift Sol A Stuck ON | 0xA0 | ✓ |
| 0x00FC48 | P0758 | Shift Sol B Electrical | 0xA0 | ✓ |
| 0x00FC54 | P0756 | Shift Sol B Performance | 0xA0 | ✓ |
| 0x00FC58 | P0757 | Shift Sol B Stuck ON | 0xA0 | ✓ |
| 0x00FC74 | P0742 | TCC Stuck ON | 0xA0 | ✓ |
| 0x00FC84 | P0711 | TFT Sensor Circuit | 0xC0 | ✓ |
| 0x00FC88 | P0713 | TFT High | 0xC0 | ✓ |
| 0x00FC8C | P0712 | TFT Low | 0xC0 | ✓ |
| 0x00FC98 | P0723 | OSS Intermittent | 0xA0 | ✓ |
| 0x00FC9C | P0722 | OSS No Signal | 0xA0 | ✓ |

## Disabled DTCs present in the table

These slots have a valid DTC code but the enable byte is 0x00. The ECU's firmware knows about these codes but won't report them. Useful as evidence of which features are *implemented but switched off* on this calibration.

| Addr | Code |
|------|------|
| 0x00F940 | P0000 |
| 0x00F944 | P1381 |
| 0x00F948 | P1380 |
| 0x00F950 | P0533 |
| 0x00F954 | P0532 |
| 0x00F958 | P6001 |
| 0x00F95C | P6011 |
| 0x00F960 | P0410 |
| 0x00F964 | P0000 |
| 0x00F968 | P0411 |
| 0x00F970 | P6106 |
| 0x00F974 | P6116 |
| 0x00F988 | P0342 |
| 0x00F9A8 | P0606 |
| 0x00F9C8 | P1587 |
| 0x00F9D0 | P6000 |
| 0x00F9D4 | P6010 |
| 0x00F9E4 | P6101 |
| 0x00F9E8 | P6111 |
| 0x00FA1C | P0357 |
| 0x00FA20 | P0358 |
| 0x00FA6C | P1646 |
| 0x00FA9C | P6102 |
| 0x00FAA0 | P6112 |
| 0x00FAA4 | P6103 |
| 0x00FAA8 | P6113 |
| 0x00FACC | P0230 |
| 0x00FAD0 | P0606 |
| 0x00FAD8 | P0423 |
| 0x00FADC | P0433 |
| 0x00FAF8 | P1509 |
| 0x00FAFC | P1508 |
| 0x00FB00 | P1631 |
| 0x00FB04 | P1649 |
| 0x00FB08 | P1626 |
| 0x00FB0C | P1648 |
| 0x00FB28 | P0207 |
| 0x00FB2C | P0208 |
| 0x00FB38 | P0000 |
| 0x00FB40 | P0000 |
| 0x00FB50 | P0000 |
| 0x00FB54 | P0000 |
| 0x00FB58 | P1835 |
| 0x00FB5C | P0325 |
| 0x00FB60 | P0327 |
| 0x00FB64 | P0606 |
| 0x00FB8C | P6100 |
| 0x00FB90 | P6110 |
| 0x00FB98 | P5555 |
| 0x00FB9C | P5555 |
| 0x00FBA4 | P5555 |
| 0x00FBA8 | P5555 |
| 0x00FBAC | P5555 |
| 0x00FBB0 | P5555 |
| 0x00FC24 | P0550 |
| 0x00FC30 | P1625 |
| 0x00FC38 | P6004 |
| 0x00FC3C | P6014 |
| 0x00FC4C | P6005 |
| 0x00FC50 | P6015 |
| 0x00FC70 | P1887 |
| 0x00FC78 | P6006 |
| 0x00FC7C | P6016 |
| 0x00FC94 | P1336 |
| 0x00FCA0 | P0123 |
| 0x00FCA4 | P1121 |
| 0x00FCA8 | P0122 |
| 0x00FCAC | P1122 |
| 0x00FCC8 | P6104 |
| 0x00FCCC | P6114 |
| 0x00FCD8 | P0615 |
| 0x00FCF4 | P0000 |

## Slots with non-standard enable bytes

Bit 7 is unset but the byte is non-zero — these probably encode a different category (e.g. history-only, or grouped under a different MIL-control bit). Worth a closer look.

| Addr | Code | Enable byte |
|------|------|-------------|
| 0x00F924 | P0320 | 0x05 (00000101) |
| 0x00F94C | P6999 | 0x20 (00100000) |
| 0x00F98C | P0341 | 0x08 (00001000) |
| 0x00F998 | P0420 | 0x60 (01100000) |
| 0x00F99C | P0430 | 0x60 (01100000) |
| 0x00FA04 | P0351 | 0x60 (01100000) |
| 0x00FA08 | P0352 | 0x60 (01100000) |
| 0x00FA0C | P0353 | 0x60 (01100000) |
| 0x00FA10 | P0354 | 0x60 (01100000) |
| 0x00FA14 | P0355 | 0x60 (01100000) |
| 0x00FA18 | P0356 | 0x60 (01100000) |
| 0x00FA24 | P1514 | 0x60 (01100000) |
| 0x00FA44 | P1290 | 0x60 (01100000) |
| 0x00FA48 | P1299 | 0x60 (01100000) |
| 0x00FA4C | P1125 | 0x60 (01100000) |
| 0x00FA50 | P1295 | 0x60 (01100000) |
| 0x00FA70 | P1515 | 0x60 (01100000) |
| 0x00FA74 | P1516 | 0x60 (01100000) |
| 0x00FA7C | P1441 | 0x60 (01100000) |
| 0x00FA80 | P0440 | 0x60 (01100000) |
| 0x00FA84 | P0442 | 0x60 (01100000) |
| 0x00FA88 | P0456 | 0x60 (01100000) |
| 0x00FA8C | P0446 | 0x60 (01100000) |
| 0x00FA98 | P0601 | 0x60 (01100000) |
| 0x00FB10 | P0201 | 0x60 (01100000) |
| 0x00FB14 | P0202 | 0x60 (01100000) |
| 0x00FB18 | P0203 | 0x60 (01100000) |
| 0x00FB1C | P0204 | 0x60 (01100000) |
| 0x00FB20 | P0205 | 0x60 (01100000) |
| 0x00FB24 | P0206 | 0x60 (01100000) |
| 0x00FB34 | P1326 | 0x60 (01100000) |
| 0x00FB44 | P1310 | 0x60 (01100000) |
| 0x00FB48 | P1311 | 0x60 (01100000) |
| 0x00FB4C | P1312 | 0x60 (01100000) |
| 0x00FCDC | P2300 | 0x28 (00101000) |
| 0x00FCE0 | P0008 | 0x08 (00001000) |
| 0x00FCE8 | P5999 | 0x01 (00000001) |
