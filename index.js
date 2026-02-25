import express from 'express';
import multer from 'multer';
import pkg from 'pg';
const { Client } = pkg;
import dotenv from 'dotenv';
import { engine } from 'express-handlebars';
import sharp from 'sharp';
import fs from 'fs';

dotenv.config();

const app = express();
const client = new Client({
    connectionString: process.env.DB_URL,
    ssl: { rejectUnauthorized: false }
});

client.connect()
    .then(async () => {
        console.log('Connected to PostgreSQL');
        //just need line while dev :)
        //await client.query('DROP TABLE IF EXISTS images;');
        await client.query(`
            CREATE TABLE IF NOT EXISTS images (
                id SERIAL PRIMARY KEY,
                filename TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('Database table is ready.');
    })
    .catch(err => console.error('Connection error:', err.stack));

app.engine('hbs', engine({ extname: '.hbs', defaultLayout: false }));
app.set('view engine', 'hbs');
app.set('views', './views');

app.use('/uploads', express.static('./uploads'));

const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Only image files are allowed!'), false);
    }
};

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, 
    fileFilter: fileFilter
});

app.get('/', async (req, res) => {
    try {
        let page = parseInt(req.query.page);
        if (isNaN(page) || page < 1) page = 1;

        const limit = 9; 
        const offset = (page - 1) * limit;

        const countRes = await client.query('SELECT COUNT(*) FROM images');
        const total = parseInt(countRes.rows[0].count);
        const totalPages = Math.ceil(total / limit);

        const result = await client.query(
            'SELECT id, filename FROM images ORDER BY created_at DESC LIMIT $1 OFFSET $2',
            [limit, offset]
        );

        res.render('index', {
            images: result.rows,
            currentPage: page,
            totalPages,
            hasPrev: page > 1,
            hasNext: page < totalPages,
            prevPage: page - 1,
            nextPage: page + 1
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error loading gallery');
    }
});

app.post('/upload', (req, res) => {
    upload.single('image')(req, res, async (err) => {
        if (err) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).send('File is too large. Maximum 10MB.');
            }
            return res.status(400).send(err.message || 'Only images allowed.');
        }
        if (!req.file) return res.status(400).send('No file.');

        try {
            const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(2)}.jpg`;
            const storagePath = `./uploads/${uniqueName}`;

            await sharp(req.file.buffer)
                .resize({ width: 800, fit: 'inside', withoutEnlargement: true })
                .jpeg({ quality: 80 })
                .toFile(storagePath);

            await client.query(
                'INSERT INTO images (filename) VALUES ($1)',
                [uniqueName]
            );

            res.redirect('/?page=1');
        } catch (saveErr) {
            console.error(saveErr);
            res.status(500).send('Error saving image');
        }
    });
});

app.post('/delete/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);

        const select = await client.query(
            'SELECT filename FROM images WHERE id = $1',
            [id]
        );

        if (select.rows.length === 0) return res.redirect('/?page=1');

        const filename = select.rows[0].filename;
        const storagePath = `./uploads/${filename}`; 

        await client.query('DELETE FROM images WHERE id = $1', [id]);

        if (fs.existsSync(storagePath)) {
            fs.unlinkSync(storagePath);
        }

        res.redirect('/?page=1');
    } catch (err) {
        console.error(err);
        res.redirect('/?page=1');
    }
});

app.listen(3000, () => console.log('Server running on http://localhost:3000'));