import fs from 'fs';
import path from 'path';

// Các thư mục/file không cần thiết để đưa cho AI đọc
const IGNORE_LIST = ['node_modules', 'dist', 'build', '.git', 'package-lock.json', 'assets', '.svg', '.png', '.jpg'];
const OUTPUT_FILE = 'project-context.txt';

function getAllFiles(dirPath, arrayOfFiles) {
    const files = fs.readdirSync(dirPath);

    arrayOfFiles = arrayOfFiles || [];

    files.forEach(function(file) {
        if (IGNORE_LIST.some(ignore => file.includes(ignore))) return;

        const fullPath = path.join(dirPath, file);
        if (fs.statSync(fullPath).isDirectory()) {
            arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
        } else {
            // Chỉ lấy các file code
            if (fullPath.match(/\.(js|jsx|css|html|json|md)$/)) {
                arrayOfFiles.push(fullPath);
            }
        }
    });

    return arrayOfFiles;
}

function bundleFiles() {
    const currentDir = process.cwd();
    const allFiles = getAllFiles(currentDir);
    let outputContent = 'CẤU TRÚC VÀ MÃ NGUỒN DỰ ÁN:\n\n';

    allFiles.forEach(file => {
        const relativePath = path.relative(currentDir, file);
        const content = fs.readFileSync(file, 'utf8');
        
        outputContent += `\n\n=========================================\n`;
        outputContent += `FILE: ${relativePath}\n`;
        outputContent += `=========================================\n\n`;
        outputContent += content;
    });

    fs.writeFileSync(OUTPUT_FILE, outputContent);
    console.log(`Đã gộp thành công ${allFiles.length} files vào ${OUTPUT_FILE}`);
    console.log('Bạn có thể upload file này lên Gemini!');
}

bundleFiles();