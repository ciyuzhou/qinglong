#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 获取当前平台信息
const getCurrentPlatform = () => {
  const platform = process.platform === 'darwin' ? 'macos' : process.platform === 'win32' ? 'win' : 'linux';
  const arch = process.arch === 'x64' ? 'x64' : process.arch === 'arm64' || process.arch === 'aarch64' ? 'arm64' : 'x64';
  return { platform, arch };
};

// 配置
const CONFIG = {
  outputDir: path.join(__dirname, 'dist'),
  platforms: [
    { nodeVersion: '18', platform: 'linux', arch: 'x64' },
    { nodeVersion: '18', platform: 'linux', arch: 'arm64' },
    { nodeVersion: '18', platform: 'win', arch: 'x64' },
    { nodeVersion: '18', platform: 'macos', arch: 'x64' },
    { nodeVersion: '18', platform: 'macos', arch: 'arm64' },
  ],
};

// 解析命令行参数
const args = process.argv.slice(2);
const options = {
  localOnly: args.includes('--local-only'),
  platform: args.find(arg => arg.startsWith('--platform='))?.split('=')[1],
  arch: args.find(arg => arg.startsWith('--arch='))?.split('=')[1],
};

// 根据参数过滤平台
function getTargetPlatforms() {
  if (options.localOnly) {
    const current = getCurrentPlatform();
    console.log(`只构建当前平台: ${current.platform}-${current.arch}`);
    return [{
      nodeVersion: '18',
      platform: current.platform,
      arch: current.arch
    }];
  }
  
  if (options.platform && options.arch) {
    console.log(`只构建指定平台: ${options.platform}-${options.arch}`);
    return [{
      nodeVersion: '18',
      platform: options.platform,
      arch: options.arch
    }];
  }
  
  return CONFIG.platforms;
}

// 确保输出目录存在
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// 执行命令
function runCommand(command, cwd = __dirname) {
  console.log(`执行命令: ${command}`);
  execSync(command, { cwd, stdio: 'inherit' });
}

// 清理之前的构建
function cleanBuild() {
  console.log('清理之前的构建...');
  if (fs.existsSync(CONFIG.outputDir)) {
    fs.rmSync(CONFIG.outputDir, { recursive: true, force: true });
  }
  if (fs.existsSync(path.join(__dirname, 'back/dist'))) {
    fs.rmSync(path.join(__dirname, 'back/dist'), { recursive: true, force: true });
  }
  if (fs.existsSync(path.join(__dirname, 'static/build'))) {
    fs.rmSync(path.join(__dirname, 'static/build'), { recursive: true, force: true });
  }
  ensureDir(CONFIG.outputDir);
}

// 安装依赖
function installDependencies() {
  console.log('安装依赖...');
  runCommand('pnpm install');
}

// 构建前端
function buildFrontend() {
  console.log('构建前端...');
  runCommand('npm run build:front');
}

// 构建后端
function buildBackend() {
  console.log('构建后端...');
  runCommand('npm run build:back');
}

// 准备打包所需文件
function preparePackageFiles() {
  console.log('准备打包所需文件...');
  
  // 创建临时目录用于打包
  const tempDir = path.join(__dirname, '.pkg-temp');
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  ensureDir(tempDir);
  
  // 复制必要的文件和目录
    const copyFiles = [
      // 直接使用编译后的JavaScript文件，不再依赖TypeScript源文件
      { from: path.join(__dirname, 'static/build'), to: path.join(tempDir, 'static/build') },
      { from: path.join(__dirname, 'shell'), to: path.join(tempDir, 'shell') },
      { from: path.join(__dirname, 'sample'), to: path.join(tempDir, 'sample') },
      { from: path.join(__dirname, '.env.example'), to: path.join(tempDir, '.env.example') },
      // 复制整个static目录以确保前端文件完整（包含dist目录中的前端文件）
      { from: path.join(__dirname, 'static'), to: path.join(tempDir, 'static') },
    ];
    
    // 额外复制前端构建产物到更明确的位置
    if (fs.existsSync(path.join(__dirname, 'static/dist'))) {
      copyFiles.push({
        from: path.join(__dirname, 'static/dist'), 
        to: path.join(tempDir, 'static/dist')
      });
    }
  
  copyFiles.forEach(({ from, to }) => {
    if (fs.existsSync(from)) {
      console.log(`复制文件: ${from} -> ${to}`);
      fs.cpSync(from, to, { recursive: true });
    }
  });
  
  // 创建入口文件
  const entryContent = `
require('dotenv').config();
const path = require('path');
const fs = require('fs');

// 设置QL_DIR环境变量
process.env.QL_DIR = process.env.QL_DIR || path.dirname(process.execPath);
const qlDir = process.env.QL_DIR;
console.log('🚀 QL_DIR is set to: ' + qlDir);

// 设置NODE_PATH以支持模块解析
process.env.NODE_PATH = path.resolve(qlDir, 'node_modules');
require('module').Module._initPaths();

// 配置静态文件服务路径，确保前端可以正确加载
process.env.STATIC_PATH = path.resolve(qlDir, 'static');
console.log('📁 Static files path: ' + process.env.STATIC_PATH);

// 只使用编译后的JavaScript文件作为入口，不再依赖TypeScript和ts-node
let appPath;
const possiblePaths = [
  // 主要使用编译后的app.js
  path.join(qlDir, 'static', 'build', 'app.js'),
  // 备用路径
  path.join(process.cwd(), 'static', 'build', 'app.js')
];

console.log('🔍 Looking for app entry in:');
for (const p of possiblePaths) {
  console.log('  - ' + p);
  if (fs.existsSync(p)) {
    appPath = p;
    console.log('✅ Found app entry file: ' + appPath);
    break;
  }
}

if (!appPath) {
  console.error('❌ Error: Cannot find compiled app.js file');
  console.error('Please make sure you have properly built the project with: npm run build:back');
  console.error('Expected path: static/build/app.js');
  process.exit(1);
}

// 验证前端文件是否存在 - 检查多个可能的位置
const frontendIndexPaths = [
  path.join(qlDir, 'static', 'dist', 'index.html'),
  path.join(qlDir, 'static', 'index.html')
];
let frontendFound = false;

for (const indexPath of frontendIndexPaths) {
  if (fs.existsSync(indexPath)) {
    console.log('✅ Frontend files found at: ' + path.dirname(indexPath));
    // 如果在dist子目录找到，设置正确的静态文件路径
    if (indexPath.includes('dist')) {
      process.env.STATIC_PATH = path.dirname(path.dirname(indexPath));
      console.log('📁 Updated static path to: ' + process.env.STATIC_PATH);
    }
    frontendFound = true;
    break;
  }
}

if (!frontendFound) {
  console.warn('⚠️ Frontend index.html not found in expected locations:');
  frontendIndexPaths.forEach(path => console.log('  - ' + path));
}

// 加载应用
try {
  console.log('🎯 Loading application from:', appPath);
  require(appPath);
} catch (error) {
  console.error('❌ Error loading app:', error.message);
  console.error('Error stack:', error.stack);
  process.exit(1);
}
`;
  fs.writeFileSync(path.join(tempDir, 'entry.js'), entryContent);
  
  return tempDir;
}

// 使用pkg打包
function packageWithPkg(tempDir, platformConfig) {
  const { nodeVersion, platform, arch } = platformConfig;
  const outputName = `qinglong-${platform}-${arch}`;
  const outputPath = path.join(CONFIG.outputDir, outputName);
  
  console.log(`打包 ${platform}-${arch} 版本...`);
  
  try {
    runCommand(
      `npx pkg@5.8.1 --targets node${nodeVersion}-${platform}-${arch} --output ${outputPath} ${tempDir}/entry.js`,
      __dirname
    );
    
    // 创建发布包
    const releaseDir = path.join(CONFIG.outputDir, `${outputName}-release`);
    ensureDir(releaseDir);
    
    // 复制二进制文件到发布目录
    if (platform === 'win') {
      if (fs.existsSync(`${outputPath}.exe`)) {
        fs.cpSync(`${outputPath}.exe`, path.join(releaseDir, `${outputName}.exe`));
      }
    } else {
      if (fs.existsSync(outputPath)) {
        fs.cpSync(outputPath, path.join(releaseDir, outputName));
      }
    }
    
    // 复制其他必要文件
    const copyFiles = [
      { from: path.join(tempDir, 'static'), to: path.join(releaseDir, 'static') },
      { from: path.join(tempDir, 'shell'), to: path.join(releaseDir, 'shell') },
      { from: path.join(tempDir, 'sample'), to: path.join(releaseDir, 'sample') },
      { from: path.join(tempDir, '.env.example'), to: path.join(releaseDir, '.env.example') },
    ];
    
    copyFiles.forEach(({ from, to }) => {
      if (fs.existsSync(from)) {
        fs.cpSync(from, to, { recursive: true });
      }
    });
    
    // 创建启动脚本
    if (platform === 'win') {
      const startScript = `@echo off
set QL_DIR=%~dp0
${outputName}.exe
`;
      fs.writeFileSync(path.join(releaseDir, 'start.bat'), startScript);
    } else {
      const startScript = `#!/bin/bash

# 设置QL_DIR环境变量
QL_DIR=$(cd "$(dirname "$0")" && pwd)
export QL_DIR

echo "🚀 QL_DIR is set to: $QL_DIR"
echo "📁 Static files path: $QL_DIR/static"

# 检查是否存在.env文件，如果不存在则从.env.example复制
if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo "✅ Created .env file from .env.example"
    else
        echo "❌ .env.example not found, please create .env file manually"
    fi
fi

# 更新.env文件设置正确的端口
echo "✅ .env file updated with correct ports"
cat > .env << 'EOF2'
# 数据库配置
DB_TYPE=sqlite
DB_HOST=
DB_PORT=
DB_USERNAME=
DB_PASSWORD=
DB_NAME=go.db

# 服务器配置
PORT=5700
BACK_PORT=5700
GRPC_PORT=5500
GOTTY_PORT=5600

# 环境配置
NODE_ENV=production
QL_DIR=$QL_DIR
EOF2

# 设置执行权限
chmod +x ./${outputName}

# 添加信号处理，支持Ctrl+C正常退出
cleanup() {
    echo "\n🛑 正在停止服务..."
    # 找到并终止所有相关进程
    if [ -n "$PID" ]; then
        kill -INT $PID 2>/dev/null
        wait $PID 2>/dev/null
    fi
    echo "✅ 服务已停止"
    exit 0
}

# 捕获SIGINT信号（Ctrl+C）
trap cleanup SIGINT SIGTERM

# 启动二进制文件并保存PID
echo "🚀 正在启动服务..."
./${outputName} &
PID=$!

# 等待进程结束或信号
echo "🎯 服务启动成功，PID: $PID"
echo "💡 按 Ctrl+C 停止服务"
wait $PID
`;
      fs.writeFileSync(path.join(releaseDir, 'start.sh'), startScript);
      try {
        execSync(`chmod +x ${path.join(releaseDir, 'start.sh')}`);
      } catch (e) {
        console.log('警告: 设置执行权限失败，但不影响打包');
      }
    }
    
    // 复制version.yaml文件到发布目录
    const versionYamlPath = path.join(__dirname, 'version.yaml');
    if (fs.existsSync(versionYamlPath)) {
      try {
        fs.cpSync(versionYamlPath, path.join(releaseDir, 'version.yaml'));
        console.log(`✅ version.yaml已复制到发布目录`);
      } catch (e) {
        console.log('警告: 复制version.yaml失败，但不影响打包');
      }
    }
    
    // 创建zip包
    console.log(`创建 ${outputName}.zip...`);
    const zipCommand = platform === 'win' 
      ? `powershell Compress-Archive -Path "${releaseDir}\*" -DestinationPath "${CONFIG.outputDir}\${outputName}.zip" -Force`
      : `cd "${CONFIG.outputDir}" && zip -r "${outputName}.zip" "${outputName}-release"`;
    
    try {
      runCommand(zipCommand);
      console.log(`${platform}-${arch} 版本打包完成: ${CONFIG.outputDir}/${outputName}.zip`);
    } catch (e) {
      console.error(`创建zip包失败，可能需要安装zip工具:`, e.message);
    }
  } catch (error) {
    console.error(`打包 ${platform}-${arch} 版本失败:`, error.message);
  }
}

// 生成GitHub Release脚本
function generateGithubReleaseScript() {
  const releaseScriptPath = path.join(__dirname, 'github-release.js');
  const releaseScript = `#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 读取版本信息
const version = require('./package.json').version;
const releaseTag = \`v\${version}\`;
const releaseTitle = \`Release v\${version}\`;
const releaseBody = \`## v\${version}\n\n自动生成的发布版本。\`;
const assetsDir = path.join(__dirname, 'dist');

// 获取所有zip文件
const assets = fs.readdirSync(assetsDir)
  .filter(file => file.endsWith('.zip'))
  .map(file => path.join(assetsDir, file));

console.log(\`创建GitHub Release: \${releaseTag}\`);

// 构建命令
let command = \`gh release create \${releaseTag} --title "\${releaseTitle}" --body "\${releaseBody}"\`;

// 添加资产文件
assets.forEach(asset => {
  command += \` "\${asset}"\`;
});

// 执行命令
console.log('执行GitHub Release创建命令...');
try {
  execSync(command, { stdio: 'inherit' });
  console.log('GitHub Release创建完成！');
} catch (error) {
  console.error('创建GitHub Release失败，请确保已安装GitHub CLI并登录。');
  console.error('错误信息:', error.message);
}
`;
  
  fs.writeFileSync(releaseScriptPath, releaseScript);
  try {
    fs.chmodSync(releaseScriptPath, '755');
  } catch (e) {
    console.log('警告: 设置GitHub Release脚本执行权限失败');
  }
  console.log(`GitHub Release脚本已生成: ${releaseScriptPath}`);
}

// 主函数
async function main() {
  try {
    // 清理构建
    cleanBuild();
    
    // 安装依赖
    installDependencies();
    
    // 构建前端和后端
    buildFrontend();
    buildBackend();
    
    // 准备打包文件
    const tempDir = preparePackageFiles();
    
    // 获取目标平台
    const targetPlatforms = getTargetPlatforms();
    
    // 为每个平台打包
    for (const platform of targetPlatforms) {
      packageWithPkg(tempDir, platform);
    }
    
    // 清理临时目录
    if (fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (e) {
        console.log('警告: 清理临时目录失败');
      }
    }
    
    // 生成GitHub Release脚本
    generateGithubReleaseScript();
    
    console.log('\n🎉 所有平台的二进制包打包完成！');
    console.log('📁 输出目录:', CONFIG.outputDir);
    console.log('\n要创建GitHub Release，请运行:');
    console.log('  node github-release.js');
  } catch (error) {
    console.error('\n❌ 构建过程中出现错误:', error.message);
    process.exit(1);
  }
}

// 执行主函数
main();