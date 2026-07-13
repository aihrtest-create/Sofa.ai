export const FABRICS = Object.freeze([
  {
    id: "boucle-ivory",
    name: "Букле",
    tone: "Тёплый айвори",
    file: "boucle-ivory.jpg",
    traits: {
      color: "warm ivory, softly creamy rather than pure white",
      structure: "dense irregular small looped bouclé yarn",
      pile: "soft dimensional loops with no directional nap",
      sheen: "fully matte with diffuse highlights",
      scale: "small upholstery-scale loops, consistent across every sofa panel",
    },
  },
  {
    id: "velvet-olive",
    name: "Велюр",
    tone: "Глубокий оливковый",
    file: "velvet-olive.jpg",
    traits: {
      color: "deep muted olive green",
      structure: "very dense short velvet pile",
      pile: "directional nap with restrained tonal change on curved surfaces",
      sheen: "soft low-luster highlights, never glossy",
      scale: "fine uniform upholstery pile",
    },
  },
  {
    id: "chenille-mushroom",
    name: "Шенилл",
    tone: "Грибной беж",
    file: "chenille-mushroom.jpg",
    traits: {
      color: "warm mushroom beige with subtle greige depth",
      structure: "fine plush chenille with a quiet linear woven rib",
      pile: "medium-soft tactile yarn",
      sheen: "matte with restrained yarn highlights",
      scale: "fine rib appropriate for residential sofa upholstery",
    },
  },
  {
    id: "basketweave-grey",
    name: "Рогожка",
    tone: "Светло-серый",
    file: "basketweave-grey.jpg",
    traits: {
      color: "cool light grey with tiny natural tonal flecks",
      structure: "clearly interlaced medium-scale basketweave warp and weft",
      pile: "flat woven surface with no fuzz",
      sheen: "dry and fully matte",
      scale: "medium upholstery weave, legible but never oversized",
    },
  },
  {
    id: "microvelour-terracotta",
    name: "Микровелюр",
    tone: "Терракотовый",
    file: "microvelour-terracotta.jpg",
    traits: {
      color: "rich muted terracotta, warm burnt clay rather than bright orange",
      structure: "extremely fine smooth microvelour surface",
      pile: "short dense directional microfiber nap",
      sheen: "softly matte with subtle tonal response",
      scale: "nearly seamless fine pile",
    },
  },
  {
    id: "faux-suede-graphite",
    name: "Искусственная замша",
    tone: "Графитовый тауп",
    file: "faux-suede-graphite.jpg",
    traits: {
      color: "graphite brown with charcoal and dark taupe undertones",
      structure: "uniform dense faux-suede microfiber",
      pile: "very fine dry-touch nap with gentle directional tonal variation",
      sheen: "fully matte, never leather-like or glossy",
      scale: "smooth continuous upholstery surface",
    },
  },
]);

export function getFabric(id) {
  return FABRICS.find((fabric) => fabric.id === id) ?? null;
}
