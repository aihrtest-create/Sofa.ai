import { FABRICS } from "../shared/fabrics.js";
import basketweaveGrey from "./assets/fabrics/basketweave-grey.jpg";
import boucleIvory from "./assets/fabrics/boucle-ivory.jpg";
import chenilleMushroom from "./assets/fabrics/chenille-mushroom.jpg";
import fauxSuedeGraphite from "./assets/fabrics/faux-suede-graphite.jpg";
import microvelourTerracotta from "./assets/fabrics/microvelour-terracotta.jpg";
import velvetOlive from "./assets/fabrics/velvet-olive.jpg";

const images = {
  "basketweave-grey": basketweaveGrey,
  "boucle-ivory": boucleIvory,
  "chenille-mushroom": chenilleMushroom,
  "faux-suede-graphite": fauxSuedeGraphite,
  "microvelour-terracotta": microvelourTerracotta,
  "velvet-olive": velvetOlive,
};

export const fabricPresets = FABRICS.map((fabric) => ({ ...fabric, image: images[fabric.id] }));
