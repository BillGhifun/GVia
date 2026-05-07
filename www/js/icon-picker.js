// ====== 图标选择器相关功能 ======

/**
 * 规范化图标URL：如果URL以 http(s):// 开头且以 / 结尾，自动补全 favicon.ico
 * @param {string} url - 图标URL
 * @returns {string} - 规范化后的URL
 */
function normalizeIconUrl(url) {
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
        if (url.endsWith('/')) {
            return url + 'favicon.ico';
        }
    }
    return url;
}

/**
 * 更新图标预览
 * @param {string} iconValue - 图标值（Font Awesome类名或图片URL）
 * @param {HTMLElement} previewElement - 预览容器元素
 */
function updateIconPreview(iconValue, previewElement) {
    if (!iconValue || !previewElement) {
        if (previewElement) previewElement.innerHTML = '';
        return;
    }
    
    // 规范化图标URL
    iconValue = normalizeIconUrl(iconValue);
    
    // Font Awesome 图标
    if (iconValue.startsWith('fas ') || iconValue.startsWith('fab ') || iconValue.startsWith('far ')) {
        previewElement.innerHTML = `<i class="${iconValue}"></i>`;
    }
    // 图片URL
    else if (iconValue.startsWith('http') || 
             iconValue.endsWith('.svg') || 
             iconValue.endsWith('.png') || 
             iconValue.endsWith('.jpg') ||
             iconValue.endsWith('.jpeg') ||
             iconValue.endsWith('.ico') ||
             iconValue.endsWith('.webp')) {
        previewElement.innerHTML = `<img src="${iconValue}" style="width: 24px; height: 24px;">`;
    }
    // 其他情况显示文本
    else {
        previewElement.innerHTML = iconValue;
    }
}

/**
 * 初始化图标选择器
 * @param {string} inputId - 输入框ID
 * @param {string} previewId - 预览容器ID
 * @param {string} pickerId - 图标选择器面板ID
 */
function initIconPicker(inputId, previewId, pickerId) {
    const iconInput = document.getElementById(inputId);
    const iconPreview = document.getElementById(previewId);
    const iconPicker = document.getElementById(pickerId);
    
    if (!iconInput || !iconPreview || !iconPicker) {
        console.error('图标选择器初始化失败：找不到必要的DOM元素');
        return;
    }
    
    // 初始化预览
    updateIconPreview(iconInput.value, iconPreview);
    
    // 输入框变化时更新预览
    iconInput.oninput = () => {
        updateIconPreview(iconInput.value, iconPreview);
        // 清除所有选中状态
        iconPicker.querySelectorAll('.icon-picker-item').forEach(opt => opt.classList.remove('selected'));
    };
    
    // 图标选择器点击事件
    iconPicker.querySelectorAll('.icon-picker-item').forEach(item => {
        const iconClass = item.getAttribute('data-icon');
        
        // 如果当前图标匹配，添加选中状态
        if (iconClass === iconInput.value) {
            item.classList.add('selected');
        }
        
        item.onclick = () => {
            iconInput.value = iconClass;
            updateIconPreview(iconClass, iconPreview);
            // 切换选中状态
            iconPicker.querySelectorAll('.icon-picker-item').forEach(opt => opt.classList.remove('selected'));
            item.classList.add('selected');
        };
    });
}

// ====== 快捷方式图标预览功能 ======

/**
 * 更新快捷方式图标预览
 * @param {string} iconValue - 图标值
 */
function updateCardIconPreview(iconValue) {
    const iconPreview = document.getElementById('card-icon-preview');
    if (!iconPreview) return;
    
    if (!iconValue) {
        iconPreview.innerHTML = '';
        return;
    }
    
    // 规范化图标URL
    iconValue = normalizeIconUrl(iconValue);
    
    // Font Awesome 图标
    if (iconValue.startsWith('fas ') || iconValue.startsWith('fab ') || iconValue.startsWith('far ')) {
        iconPreview.innerHTML = `<i class="${iconValue}"></i>`;
    }
    // 图片URL
    else if (iconValue.startsWith('http') || 
             iconValue.endsWith('.svg') || 
             iconValue.endsWith('.png') || 
             iconValue.endsWith('.jpg') ||
             iconValue.endsWith('.jpeg') ||
             iconValue.endsWith('.ico') ||
             iconValue.endsWith('.webp')) {
        iconPreview.innerHTML = `<img src="${iconValue}" style="width: 24px; height: 24px;">`;
    }
    // 其他情况显示文本
    else {
        iconPreview.innerHTML = iconValue;
    }
}
