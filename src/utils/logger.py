"""日志记录工具模块"""
import logging
import sys
from pathlib import Path
from typing import Optional


class Logger:
    """统一日志记录器"""

    _instances = {}

    @staticmethod
    def get_logger(name: str = 'reconciliation',
                  log_file: Optional[str] = None,
                  level: int = logging.INFO) -> logging.Logger:
        """获取日志记录器实例

        Args:
            name: 日志记录器名称
            log_file: 日志文件路径（可选）
            level: 日志级别

        Returns:
            配置好的日志记录器
        """
        if name in Logger._instances:
            return Logger._instances[name]

        logger = logging.getLogger(name)
        logger.setLevel(level)
        logger.handlers = []  # 清除已有的处理器

        # 控制台处理器
        console_handler = logging.StreamHandler(sys.stdout)
        console_handler.setLevel(level)
        console_formatter = logging.Formatter(
            '[%(asctime)s] %(levelname)s - %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        )
        console_handler.setFormatter(console_formatter)
        logger.addHandler(console_handler)

        # 文件处理器（可选）
        if log_file:
            log_path = Path(log_file)
            log_path.parent.mkdir(parents=True, exist_ok=True)
            file_handler = logging.FileHandler(log_file, encoding='utf-8')
            file_handler.setLevel(level)
            file_formatter = logging.Formatter(
                '[%(asctime)s] %(name)s - %(levelname)s - %(message)s',
                datefmt='%Y-%m-%d %H:%M:%S'
            )
            file_handler.setFormatter(file_formatter)
            logger.addHandler(file_handler)

        Logger._instances[name] = logger
        return logger


def get_logger(name: str = 'reconciliation',
               log_file: Optional[str] = None,
               verbose: bool = False) -> logging.Logger:
    """获取日志记录器的便捷函数

    Args:
        name: 日志记录器名称
        log_file: 日志文件路径（可选）
        verbose: 是否为详细日志模式

    Returns:
        配置好的日志记录器
    """
    level = logging.DEBUG if verbose else logging.INFO
    return Logger.get_logger(name, log_file, level)
