import React from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/cormorant-garamond/400.css";
import "@fontsource/cormorant-garamond/500.css";
import "@fontsource/manrope/400.css";
import "@fontsource/manrope/500.css";
import "@fontsource/manrope/600.css";
import { App } from "./App.jsx";
import { SingleShotApp } from "./SingleShotApp.jsx";
import "./styles.css";
import "./single-shot.css";

const restoredRoute = new URLSearchParams(window.location.search).get("route");
if (restoredRoute) {
  window.history.replaceState(null, "", `${import.meta.env.BASE_URL}${restoredRoute}`);
}

const activePath = restoredRoute || window.location.pathname;
const normalizedPath = `/${activePath.replace(/^\/+|\/+$/g, "")}`;
const isPagesSingleShot = import.meta.env.VITE_PAGES_VARIANT === "single-shot";
const RootApp = isPagesSingleShot || normalizedPath.endsWith("/single-shot") ? SingleShotApp : App;

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <RootApp />
  </React.StrictMode>,
);
