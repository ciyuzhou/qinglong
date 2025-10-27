#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 读取版本信息
const version = require('./package.json').version;
const releaseTag = `v${version}`;
const releaseTitle = `Release v${version}`;
const releaseBody = `## v${version}

自动生成的发布版本。`;
const assetsDir = path.join(__dirname, 'dist');

// 获取所有zip文件
const assets = fs.readdirSync(assetsDir)
  .filter(file => file.endsWith('.zip'))
  .map(file => path.join(assetsDir, file));

console.log(`创建GitHub Release: ${releaseTag}`);

// 构建命令
let command = `gh release create ${releaseTag} --title "${releaseTitle}" --body "${releaseBody}"`;

// 添加资产文件
assets.forEach(asset => {
  command += ` "${asset}"`;
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
