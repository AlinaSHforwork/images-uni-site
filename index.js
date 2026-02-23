import express from 'express';
import dotenv from 'dotenv';
import pkg from 'pg'; 
const { Client } = pkg;
import multer from 'multer'; 
import path from 'path';
import fs from 'fs/promises'

dotenv.config();

const app = express();
const client = new Client({
   connectionString: process.env.DB_URL,
   ssl: {
       rejectUnauthorized: false 
   }
});

client.connect()
    .then(async () => {
        console.log('Connected to PostgreSQL');
        
        const createTableQuery = `
            CREATE TABLE IF NOT EXISTS images (
                id SERIAL PRIMARY KEY,
                filename TEXT NOT NULL,
                filepath TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;

        try {
            await client.query(createTableQuery);
            console.log("Database table is ready.");
        } catch (err) {
            console.error("Error creating table:", err);
        }
    })
    .catch(err => console.error('Connection error:', err.stack));

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/uploads/');
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

app.use(express.static('public'));

app.post('/upload', upload.single('image'), async (req, res) => {
    if (!req.file) return res.status(400).send('No file uploaded.');

    const { filename } = req.file;
    const filepath = `/uploads/${filename}`; 

    try {
        await client.query('INSERT INTO images (filename, filepath) VALUES ($1, $2)', [filename, filepath]);
        
        res.redirect('/'); 
    } catch (err) {
        console.error(err);
        res.status(500).send('Database Error');
    }
});

app.get('/api/images', async (req, res) => {
    try {
        const result = await client.query('SELECT * FROM images ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/images/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const findResult = await client.query('SELECT filepath FROM images WHERE id = $1', [id]);
        
        if (findResult.rows.length === 0) {
            return res.status(404).json({ error: "Image not found" });
        }

        const relativePath = findResult.rows[0].filepath; 
        const fullPath = path.join(process.cwd(), 'public', relativePath);

        await client.query('DELETE FROM images WHERE id = $1', [id]);

        try {
            await fs.unlink(fullPath);
            console.log(`Deleted file: ${fullPath}`);
        } catch (fileErr) {
            console.error("File already gone or error deleting:", fileErr.message);
        }

        res.json({ message: "Deleted successfully" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error during deletion" });
    }
});

const PORT = 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));