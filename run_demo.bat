@echo off
rem 医保对账差异归因系统 - 一键运行演示脚本 (Windows)
rem 用法: run_demo.bat

echo =========================================
echo   医保对账差异归因系统 - 演示程序
echo =========================================
echo.

rem 获取脚本所在目录
set SCRIPT_DIR=%~dp0
cd /d "%SCRIPT_DIR"

rem 检查依赖
echo [1/4] 检查依赖...
python --version >nul 2>&1
if errorlevel 1 (
    echo 错误: 未找到 Python，请先安装 Python 3.x
    exit /b 1
)

rem 安装依赖
echo [2/4] 安装依赖...
pip install -q -r requirements.txt

rem 创建输出目录
echo [3/4] 创建输出目录...
if not exist "reports\demo_output" mkdir "reports\demo_output"

rem 运行演示
echo [4/4] 运行对账演示...
echo.
python -m src.cli reconcile --his-file data/sample_his.csv --insurance-file data/sample_insurance.csv --output-dir reports/demo_output --verbose

echo.
echo =========================================
echo   演示完成！
echo   输出目录: reports\demo_output\
echo   生成文件:
echo     - diffLedger.xlsx   (差异台账)
echo     - appealLetter.docx (申诉函件草稿)
echo     - diffReport.html    (HTML报告)
echo     - diffSummary.json  (JSON摘要)
echo =========================================
pause
