# Wayfinding Map Builder

A browser-based tool for making wayfinding maps to hard-to-find addresses: a map of the surroundings, a small city map in the corner with the neighbourhood highlighted, a second close-up, drawing of routes, footpaths and stairwells, an automatic legend, and export to PNG/PDF. Base map: OpenStreetMap.

Two language versions: Polish and English.

## Running (Docker)

Requires **Docker Desktop** to be running. Run from the project directory (the one containing `docker-compose.yml`):

```powershell
docker compose up -d --build
```

Then open in a browser:

| Version | URL |
|---|---|
| automatic (based on browser language) | http://localhost:8088 |
| Polish | http://localhost:8088/pl |
| English | http://localhost:8088/en |

You can also switch language with the **PL / EN** buttons at the top left of the panel.

To stop:

```powershell
docker compose down
```

## Notes

- **Different port:** in `docker-compose.yml`, change `127.0.0.1:8088:80` to e.g. `127.0.0.1:9000:80` and re-run `docker compose up -d --build`.
- **Exposing on the local network:** change `127.0.0.1:8088:80` to `8088:80`. The tool is then reachable at `http://<hostname-or-IP-of-this-machine>:8088`.
- **After changing `site/index.html`:** run `docker compose up -d --build` (the file is copied into the image at build time).
- **Without Docker:** you can also just open `site/index.html` directly. It works the same, except that the OpenStreetMap.org base map is unavailable in that case (OpenStreetMap Deutschland, Humanitarian and OSM France remain).
- **Internet access is required:** the base map, address search (Nominatim), fonts and the Leaflet library are loaded from the network.

## Where maps are stored

Nothing is sent to a server. Your drawing is saved automatically in the browser (localStorage), separately for each page origin: the version served from `localhost:8088` does not see what you drew in a file opened from disk. To move or archive maps, use the **Save project** / **Open project** buttons (a `.json` file).

## Troubleshooting

- `docker compose` does not work → check that Docker Desktop is running (whale icon in the system tray).
- Port already in use → change the port as described above.
- Empty map → the panel shows a message under the "Base map" field; selecting a different base map or checking the corporate network filter usually helps.

## Structure

```
mapki-dojscia/
├─ docker-compose.yml   port mapping and container restart policy
├─ Dockerfile           nginx:1.27-alpine + site files
├─ nginx.conf           static file serving, /pl and /en shortcuts
├─ README.md
└─ site/
   ├─ index.html        page structure (HTML only)
   ├─ css/style.css     styles
   └─ js/               plain scripts, loaded in this order:
      ├─ i18n.js        PL/EN strings, language selection
      ├─ config.js      constants, base maps, drawing types
      ├─ state.js       app state, localStorage, undo
      ├─ draw.js        canvas drawing of lines and symbols
      ├─ map.js         Leaflet maps
      ├─ sheet.js       sheet layout (header, legend, insets)
      ├─ interaction.js drawing/selection, on-map label editor
      ├─ panel.js       side panel controls
      ├─ geo.js         address search (Nominatim), entrances (Overpass)
      ├─ export.js      PNG, clipboard, print, project files
      └─ main.js        startup
```
