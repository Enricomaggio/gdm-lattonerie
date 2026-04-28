import { Router } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "../auth";
import { insertRawMaterialSchema, insertProductSchema } from "@shared/schema";

export const catalogRouter = Router();

const updateRawMaterialSchema = insertRawMaterialSchema.partial();
const updateProductSchema = insertProductSchema.partial();

function isCatalogAdmin(role: string | undefined): boolean {
  return role === "COMPANY_ADMIN" || role === "SUPER_ADMIN";
}

// ============ RAW MATERIALS ============

// GET /api/raw-materials - Lista materie prime
catalogRouter.get("/raw-materials", isAuthenticated, async (_req, res) => {
  try {
    const materials = await storage.getRawMaterials();
    res.json(materials);
  } catch (error) {
    console.error("Error fetching raw materials:", error);
    res.status(500).json({ message: "Errore nel recupero delle materie prime" });
  }
});

// GET /api/raw-materials/:id - Dettaglio materia prima
catalogRouter.get("/raw-materials/:id", isAuthenticated, async (req, res) => {
  try {
    const material = await storage.getRawMaterial(req.params.id);
    if (!material) {
      return res.status(404).json({ message: "Materia prima non trovata" });
    }
    res.json(material);
  } catch (error) {
    console.error("Error fetching raw material:", error);
    res.status(500).json({ message: "Errore nel recupero della materia prima" });
  }
});

// POST /api/raw-materials - Crea materia prima (admin)
catalogRouter.post("/raw-materials", isAuthenticated, async (req, res) => {
  try {
    const { role } = req.user!;
    if (!isCatalogAdmin(role)) {
      return res.status(403).json({ message: "Solo gli amministratori possono creare materie prime" });
    }

    const parsed = insertRawMaterialSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Dati non validi",
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const created = await storage.createRawMaterial(parsed.data);
    res.status(201).json(created);
  } catch (error) {
    console.error("Error creating raw material:", error);
    res.status(500).json({ message: "Errore nella creazione della materia prima" });
  }
});

// PUT /api/raw-materials/:id - Aggiorna materia prima (admin)
catalogRouter.put("/raw-materials/:id", isAuthenticated, async (req, res) => {
  try {
    const { role } = req.user!;
    if (!isCatalogAdmin(role)) {
      return res.status(403).json({ message: "Solo gli amministratori possono modificare materie prime" });
    }

    const parsed = updateRawMaterialSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Dati non validi",
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const updated = await storage.updateRawMaterial(req.params.id, parsed.data);
    if (!updated) {
      return res.status(404).json({ message: "Materia prima non trovata" });
    }
    res.json(updated);
  } catch (error) {
    console.error("Error updating raw material:", error);
    res.status(500).json({ message: "Errore nell'aggiornamento della materia prima" });
  }
});

// DELETE /api/raw-materials/:id - Elimina materia prima (admin)
catalogRouter.delete("/raw-materials/:id", isAuthenticated, async (req, res) => {
  try {
    const { role } = req.user!;
    if (!isCatalogAdmin(role)) {
      return res.status(403).json({ message: "Solo gli amministratori possono eliminare materie prime" });
    }

    const deleted = await storage.deleteRawMaterial(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: "Materia prima non trovata" });
    }
    res.status(204).send();
  } catch (error: unknown) {
    console.error("Error deleting raw material:", error);
    const code = (error as { code?: string } | null)?.code;
    if (code === "23503") {
      return res.status(409).json({
        message: "Impossibile eliminare: la materia prima è usata da uno o più prodotti finiti",
      });
    }
    res.status(500).json({ message: "Errore nell'eliminazione della materia prima" });
  }
});

// ============ PRODUCTS ============

// GET /api/products - Lista prodotti finiti (con materia prima associata)
catalogRouter.get("/products", isAuthenticated, async (_req, res) => {
  try {
    const items = await storage.getProducts();
    res.json(items);
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({ message: "Errore nel recupero dei prodotti" });
  }
});

// GET /api/products/:id - Dettaglio prodotto (con materia prima)
catalogRouter.get("/products/:id", isAuthenticated, async (req, res) => {
  try {
    const product = await storage.getProduct(req.params.id);
    if (!product) {
      return res.status(404).json({ message: "Prodotto non trovato" });
    }
    res.json(product);
  } catch (error) {
    console.error("Error fetching product:", error);
    res.status(500).json({ message: "Errore nel recupero del prodotto" });
  }
});

// POST /api/products - Crea prodotto (admin)
catalogRouter.post("/products", isAuthenticated, async (req, res) => {
  try {
    const { role } = req.user!;
    if (!isCatalogAdmin(role)) {
      return res.status(403).json({ message: "Solo gli amministratori possono creare prodotti" });
    }

    const parsed = insertProductSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Dati non validi",
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    // Verifica che la materia prima esista
    const rm = await storage.getRawMaterial(parsed.data.rawMaterialId);
    if (!rm) {
      return res.status(400).json({ message: "Materia prima non trovata" });
    }

    const created = await storage.createProduct(parsed.data);
    res.status(201).json(created);
  } catch (error) {
    console.error("Error creating product:", error);
    res.status(500).json({ message: "Errore nella creazione del prodotto" });
  }
});

// PUT /api/products/:id - Aggiorna prodotto (admin)
catalogRouter.put("/products/:id", isAuthenticated, async (req, res) => {
  try {
    const { role } = req.user!;
    if (!isCatalogAdmin(role)) {
      return res.status(403).json({ message: "Solo gli amministratori possono modificare prodotti" });
    }

    const parsed = updateProductSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Dati non validi",
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    if (parsed.data.rawMaterialId) {
      const rm = await storage.getRawMaterial(parsed.data.rawMaterialId);
      if (!rm) {
        return res.status(400).json({ message: "Materia prima non trovata" });
      }
    }

    const updated = await storage.updateProduct(req.params.id, parsed.data);
    if (!updated) {
      return res.status(404).json({ message: "Prodotto non trovato" });
    }
    res.json(updated);
  } catch (error) {
    console.error("Error updating product:", error);
    res.status(500).json({ message: "Errore nell'aggiornamento del prodotto" });
  }
});

// DELETE /api/products/:id - Elimina prodotto (admin)
catalogRouter.delete("/products/:id", isAuthenticated, async (req, res) => {
  try {
    const { role } = req.user!;
    if (!isCatalogAdmin(role)) {
      return res.status(403).json({ message: "Solo gli amministratori possono eliminare prodotti" });
    }

    const deleted = await storage.deleteProduct(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: "Prodotto non trovato" });
    }
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting product:", error);
    res.status(500).json({ message: "Errore nell'eliminazione del prodotto" });
  }
});
