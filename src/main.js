// src/main.js
import { GameController } from "./app.js";
import { registerServiceWorker } from "./pwa.js";

window.gameController = new GameController();
registerServiceWorker();