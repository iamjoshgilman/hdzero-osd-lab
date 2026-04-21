import { render } from "preact";
import { App } from "./app";
import "./styles.css";

const mount = document.getElementById("app");
if (!mount) throw new Error("#app root element missing from index.html");
render(<App />, mount);
