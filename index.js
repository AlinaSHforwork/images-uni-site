import express from 'express';
import multer from 'multer';
import pkg from 'pg';
const { Client } = pkg;
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const client = new Client({
    connectionString: process.env.DB_URL,
    ssl: { rejectUnauthorized: false }
});

client.connect()
    .then(async () => {
        console.log('Connected to PostgreSQL');
        await client.query(`
            CREATE TABLE IF NOT EXISTS images (
                id SERIAL PRIMARY KEY,
                filename TEXT NOT NULL,
                mimetype TEXT NOT NULL,
                data BYTEA NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('Database table is ready.');
    })
    .catch(err => console.error('Connection error:', err.stack));

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.use(express.static('public'));

app.post('/upload', upload.single('image'), async (req, res) => {
    if (!req.file) return res.status(400).send('No file.');

    try {
        const query = 'INSERT INTO images (filename, mimetype, data) VALUES ($1, $2, $3)';
        await client.query(query, [req.file.originalname, req.file.mimetype, req.file.buffer]);
        
        res.redirect('/'); 
    } catch (err) {
        console.error(err);
        res.status(500).send('Error saving to DB');
    }
});

app.get('/api/images', async (req, res) => {
    try {
        const result = await client.query('SELECT id, filename, mimetype, data FROM images ORDER BY created_at DESC');
        
        const images = result.rows.map(row => ({
            id: row.id,
            filename: row.filename,
            imageData: `data:${row.mimetype};base64,${row.data.toString('base64')}`
        }));

        res.json(images);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/images/:id', async (req, res) => {
    try {
        await client.query('DELETE FROM images WHERE id = $1', [req.params.id]);
        res.json({ message: "Deleted from DB" });
    } catch (err) {
        res.status(500).send("Error");
    }
});

app.listen(3000, () => console.log('Server running on http://localhost:3000'));